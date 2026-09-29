// 下载模块
const os = require('os');
const pLimit = require('p-limit').default;

const fs = require('fs');
const path = require('path');
const yazl = require('yazl');
const StreamZip = require('node-stream-zip');
const { iComicCtrl } = require('../../units/iComic');

// 按需任务全部页下载完成后的延迟合并时间（给正在阅读的会话留出读分片的时间）
const ON_DEMAND_MERGE_DELAY_MS = 5 * 60 * 1000;
// 按需任务分片读取缓存上限（LRU），防止长时间翻页积累过多 zip 文件句柄
const MAX_PART_CACHE = 8;

class BlockDownloader {
    constructor(task, page_zip, page_detail_title, i) {
        this.task = task;
        this.page_zip = page_zip;
        this.page_detail_title = page_detail_title;
        this.i = i;
        this.errors = [];

        // 动态并发控制配置
        let cpu_count = os.cpus().length;
        this.concurrency = (Number(this.task.plugin?.config?.block_concurrency) || cpu_count);
        this.concurrency = Math.min(this.concurrency, cpu_count);
        // 使用pLimit控制并发
        this.limit = pLimit(this.concurrency);
    }

    async downloadAll(urls) {
        // 按页进度：开始时登记总块数，每个块结束（无论成败）后累加
        this.task.setPageBlockProgressTotal(this.i, urls.length);
        const downloadPromises = urls.map((url, j) =>
            this.limit(() => this.downloadWithRetry(url, j).finally(() => {
                this.task.incrementPageBlockDone(this.i);
            }))
        );

        console.log(`开始下载`, urls.length, `个块，并发数:`, this.concurrency);

        const results = await Promise.allSettled(downloadPromises);

        // 处理结果
        for (let j = 0; j < results.length; j++) {
            let result = results[j];

            if (result.status === 'fulfilled' && result.value.status) {
                // 成功完成的 Promise
                let filename = await this.task.plugin.saveBlockName(
                    this.task.name,
                    this.page_detail_title,
                    urls[j],
                    this.i,
                    j
                );

                filename = this.task.safePathName(filename);
                this.page_zip.addBuffer(result.value.data, filename);
            } else if (result.status === 'rejected') {
                // 被拒绝的 Promise
                this.errors.push(result.reason.msg);
            } else if (result.status === 'fulfilled' && !result.value.status) {
                // 成功完成但返回状态为失败的 Promise
                this.errors.push(result.value.msg);
            }
        }

        return { errors: this.errors };
    }

    async downloadWithRetry(url, j, retry_count = 5) {
        let retries = Number(this.task.plugin.config?.retry_count) || 5;

        for (let attempt = 1; attempt <= retries; attempt++) {
            if (!this.task.isWorking()) {
                return { status: false, msg: '任务状态改变' };
            }

            try {
                //console.log(`downloader begin block [`, j, `]`, `[`, attempt, "/", retries, "]", url);
                const result = await this._downloadBlockWithTimeout(url, j);

                if (result.status) {
                    console.log(`downloader success block [`, j, `]`, `[`, attempt, "/", retries, "]", url);
                    return result;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err) {
                if (attempt >= retries) {
                    console.log(`downloader error block [`, j, `]`, `[`, attempt, "/", retries, "]", url, err.message);
                    this.task.add_current_page_fail_count();
                    this.task.errors.push(`page[${this.i}]block:[${j}] [${attempt}/${retries}] ${url} ${err.message}`);
                    return { status: false, msg: err.message };
                }
            }
        }
    }
    _downloadBlockWithTimeout(url, j) {
        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`downloader timeout ${this.page_detail_title},${j},${url}`));
            }, 180000);

            try {
                const result = await this.task.plugin.getPageDetailBlock(url);
                clearTimeout(timer);

                if (result.status === false) {
                    reject(new Error(result.msg));
                    return;
                }

                this.task.add_current_page_complete_count();
                resolve({
                    status: true,
                    data: await this.task.plugin.parseFile(result)
                });

            } catch (err) {
                clearTimeout(timer);
                reject(err);
            }
        });
    }
}

class PageDownloader {
    constructor(task, plugin, pages, tmp_dir, iComic) {
        this.task = task;
        this.plugin = plugin;
        this.pages = pages;
        this.tmp_dir = tmp_dir;
        this.iComic = iComic;
        this.errors = [];

        // 动态并发控制配置
        let cpu_count = os.cpus().length;
        this.concurrency = (Number(this.task.plugin?.config?.page_concurrency) || cpu_count);
        this.concurrency = Math.min(this.concurrency, cpu_count);

        // 使用pLimit控制并发
        this.limit = pLimit(this.concurrency);
    }

    async downloadPages(page_start = 0) {
        // 只处理从page_start开始的页面
        const pageDownloads = this.pages
            .slice(page_start)  // 从page_start开始截取数组
            .map((page, i) => this.limit(() => this.downloadPage(page, i + page_start)));  // 保持原始索引

        console.log('Begin download', this.pages.length - page_start, 'pages, concurrency:', this.concurrency);

        const results = await Promise.allSettled(pageDownloads);

        // 处理结果
        for (let i = 0; i < results.length; i++) {
            let result = results[i];
            let pageIndex = i + page_start;  // 保持原始索引

            if (result.status === 'rejected') {
                console.error(`Page[${pageIndex}]:`, result.reason);
                this.errors.push(`Page[${pageIndex}]:${result.reason?.message || result.reason}`);
            } else if (result.value?.status === false) {
                console.error(`Page[${pageIndex}]:`, result.value.msg);
                this.errors.push(`Page[${pageIndex}]:${result.value.msg}`);
            }
        }

        return { errors: this.errors };
    }

    async downloadPage(page, pageIndex) {
        let page_zip_path = path.join(this.tmp_dir, `${pageIndex + 1}.part`);
        let page_zip = new yazl.ZipFile();

        try {
            if (fs.existsSync(page_zip_path)) {
                this.task.add_page_complete_count();
                return { status: true };
            }

            if (!this.task.isWorking()) {
                return { status: false, msg: '任务状态改变' };
            }

            // 获取page详情（最多重试5次）
            let page_detail;
            let retry_count = Number(this.plugin.config?.retry_count) || 5;
            for (let j = 0; j < retry_count; j++) {
                try {
                    page_detail = await this.plugin.getPageDetail(page);

                    if (page_detail?.status === false) {
                        console.error(`Retry:`, j + 1, `Plugin[${this.plugin.name}][getPageDetail]Error:${page_detail?.msg}`);
                        if (j == retry_count - 1) {
                            throw new Error(page_detail?.msg);
                        }
                    } else {
                        break;
                    }
                } catch (e) {
                    this.task.set_status(4);
                    return { status: false, msg: `Plugin[${this.plugin.name}][getPageDetail]Error:${e.message}` };
                }
            }

            const page_detail_title = this.task.safePathName(page_detail.title);
            const page_detail_blocks = page_detail.blocks;

            console.log("Begin download page:", page_detail_title, "Total:", page_detail_blocks.length, "blocks");

            // 设置当前页面的块数
            this.task.set_current_page_count(page_detail_blocks.length);

            // 创建 BlockDownloader 下载块
            const downloader = new BlockDownloader(this.task, page_zip, page_detail_title, pageIndex, this.iComic);
            const { errors } = await downloader.downloadAll(page_detail_blocks);

            // 如果有错误，添加到错误列表
            if (errors.length > 0) {
                console.log(`Download page ${page_detail_title} blocks failed: error count:`, errors.length);
            }

            page_zip.end();

            if (!this.task.isWorking()) {
                try { page_zip.outputStream.destroy(); } catch (e) { }
                page_zip = null;
                return { status: false, msg: '任务状态改变' };
            }

            // 存储文件
            let save_result = await this.task.saveFileByZip(page_zip, page_zip_path);

            if (save_result !== true) {
                const errorMsg = `Save page ${page_detail_title} to ${page_zip_path} error, error:${save_result.message}`;
                console.log("Save page error:", errorMsg);
                // 更新任务计数器
                this.task.add_page_fail_count();
                return { status: false, msg: errorMsg };
            } else {
                console.log("Save page:", page_detail_title, page_zip_path, "complete");
                // 更新任务计数器
                this.task.add_page_complete_count();
                return { status: true };
            }
        } catch (error) {
            //如果文件存在就删除文件
            if (fs.existsSync(page_zip_path)) {
                fs.unlinkSync(page_zip_path);
            }

            const errorMsg = `Page:${pageIndex} Error:${error.message}`;
            console.error(errorMsg, error);

            // 更新任务状态和计数器
            this.task.set_status(4);
            this.task.add_page_fail_count();

            return { status: false, msg: errorMsg };
        } finally {
            // 释放内存（避免重复调用 end）
            if (page_zip && !page_zip._ended) {
                page_zip.end();
            }
            page_zip = null;
        }
    }
}

class download_task {
    plugin = null;
    errors = [];
    part_cache = new Map();
    // 按需下载：进行中的页（pageIndex -> Promise），防止同一页并发下载写坏 .part 文件
    downloading_pages = new Map();
    // 按需下载：预下载串行队列，避免并发请求打爆源站
    prefetch_queue = [];
    prefetch_queued = new Set();
    prefetch_pumping = false;
    // 按需下载：延迟合并定时器与合并进行中标记
    merge_timer = null;
    merging = false;
    // 按需下载：每页下载进度（pageIndex -> { done, total }），供阅读器展示
    page_progress = new Map();

    setPageBlockProgressTotal(pageIndex, total) {
        let p = this.page_progress.get(pageIndex);
        if (p) p.total = total;
        else this.page_progress.set(pageIndex, { done: 0, total });
    }

    incrementPageBlockDone(pageIndex) {
        let p = this.page_progress.get(pageIndex);
        if (p) p.done++;
    }
    constructor(task_id, helpers, library_path, nextTask) {
        let task = helpers.db_query.get('SELECT * FROM download_task WHERE id=?', [task_id]);
        let plugin = helpers.plugin.getPlugin(task.search_plugin);

        this.id = task.id;
        this.plugin_id = task.search_plugin;
        this.name = this.safePathName(task.name);
        this.status = task.status == 1 ? 4 : task.status;
        this.type = task.type;
        this.update_start = Number(task.update_start) || 0;
        this.update_library_id = task.update_library_id;

        this.cur_page_index = (this.type == 1 && this.update_library_id) ? this.update_start : 0;
        this.page_count = task.page_count;
        this.page_complete_count = task.page_complete_count;
        this.page_fail_count = task.page_fail_count;
        this.current_page_count = task.current_page_count;
        this.current_page_complete_count = task.current_page_complete_count;
        this.current_page_fail_count = task.current_page_fail_count;
        this.search_result = JSON.parse(task.search_result);

        // 按需下载相关字段
        this.plugin = plugin;
        this.library_path = library_path;
        this.nextTask = nextTask;
        this.helpers = helpers;
        this.book_meta = task.book_meta ? JSON.parse(task.book_meta) : null;
        this.downloaded_pages = task.downloaded_pages ? JSON.parse(task.downloaded_pages) : [];
        this.is_complete = task.is_complete || 0;
        this.save_dir = path.join(this.library_path, this.name);
        this.tmp_dir = path.join(this.save_dir, "._parts");

        // 重启自愈：按需任务已全部下载但尚未合并（合并中断/失败），重新排程合并
        if (this.type == 2 && this.book_meta && !this.is_complete &&
            this.downloaded_pages.length >= this.book_meta.page_count) {
            this.checkAndMerge();
        }
    }

    async set_page_count(page_count) {
        //同步设置数据库
        this.page_count = page_count;
        this.page_complete_count = 0;
        this.page_fail_count = 0;

        this.current_page_count = 0;
        this.current_page_complete_count = 0;
        this.current_page_fail_count = 0;

        await this.helpers.db_query.run('UPDATE download_task SET current_page_count = 0,current_page_complete_count = 0,current_page_fail_count = 0, page_complete_count = 0,page_fail_count = 0,page_count = ? WHERE id = ?', [page_count, this.id]);
    }

    async add_page_complete_count() {
        //page_complete_count++
        //同步设置数据库
        this.page_complete_count++;
        await this.helpers.db_query.run('UPDATE download_task SET page_complete_count = ? WHERE id = ?', [this.page_complete_count, this.id]);
    }

    async set_page_complete_count(count = 0) {
        //current_page_complete_count++
        //同步设置数据库
        this.page_complete_count = count;
        await this.helpers.db_query.run('UPDATE download_task SET page_complete_count = ? WHERE id = ?', [this.page_complete_count, this.id]);
    }

    async add_page_fail_count() {
        //page_fail_count++
        //同步设置数据库
        this.page_fail_count++;
        await this.helpers.db_query.run('UPDATE download_task SET page_fail_count = ? WHERE id = ?', [this.page_fail_count, this.id]);
    }

    async set_current_page_count(current_page_count) {
        //同步设置数据库
        this.current_page_complete_count = 0;
        this.current_page_fail_count = 0;
        this.current_page_count = current_page_count;
        await this.helpers.db_query.run('UPDATE download_task SET current_page_count = ?,current_page_complete_count = 0,current_page_fail_count = 0 WHERE id = ?', [this.current_page_count, this.id]);
    }

    async add_current_page_complete_count() {
        //current_page_complete_count++
        //同步设置数据库
        this.current_page_complete_count++;
        await this.helpers.db_query.run('UPDATE download_task SET current_page_complete_count = ? WHERE id = ?', [this.current_page_complete_count, this.id]);
    }

    async add_current_page_fail_count() {
        //current_page_fail_count++
        //同步设置数据库
        this.current_page_fail_count++;
        await this.helpers.db_query.run('UPDATE download_task SET current_page_fail_count = ? WHERE id = ?', [this.current_page_fail_count, this.id]);
    }

    async set_status(status) {
        this.status = status;
        await this.helpers.db_query.run('UPDATE download_task SET status = ? WHERE id = ?', [status, this.id]);
    }

    // 任务是否处于可下载状态（普通任务下载中=1；按需任务元数据就绪=6）
    isWorking() {
        return this.status === 1 || (this.type == 2 && this.status === 6);
    }

    saveFileByZip(zip, filePath) {
        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(filePath);
            const outputStream = zip.outputStream;

            // 设置5分钟超时防止永久挂起
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`[Save File Timeout]:${filePath}`));
            }, 1000 * 60 * 5);

            // 统一清理函数
            const cleanup = () => {
                clearTimeout(timeout);
                outputStream.unpipe(writeStream);
                if (!writeStream.destroyed) {
                    writeStream.destroy();
                }
            };

            // 先绑定事件再pipe（防止竞争条件）
            writeStream
                .on('ready', () => {
                    console.log(`[ready] 写入流已准备好: ${filePath}`);

                    setTimeout(() => {
                        outputStream.pipe(writeStream); // 开始传输数据    
                    }, 500);
                })
                .on('finish', () => {
                    console.log(`[finish] 数据已全部写入: ${filePath}`);
                    cleanup();
                    resolve(true);
                })
                .on('error', (err) => {
                    console.error(`[writeStream error] ${filePath}`, err);
                    cleanup();
                    reject(err);
                });

            outputStream
                .on('error', (err) => {
                    console.error(`[outputStream error] ${filePath}`, err);
                    cleanup();
                    reject(err);
                });
        }).finally(() => {
            zip.outputStream.destroy(); // 确保释放zip输出流
        });
    }

    safePathName(str) {
        if (!str) return '';
        // 保留：字母数字、中文、路径分隔符(/)、扩展名点(.)、连字符(-_)、空格
        // 同时去除首尾空白字符
        return str.trim().replace(/[^\w\u4e00-\u9fa5\/\.\- ]/g, '');
    }

    async begin() {
        //清空错误
        this.errors = [];

        //console.log(`内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log("download", this.name);

        if (!this.plugin && this.plugin_id) {
            this.plugin = this.helpers.plugin.getPlugin(this.plugin_id);
        }

        if (this.plugin?.type !== "search") {
            this.errors.push(`Plugin[${this.plugin_id}]not support search`);
            this.set_status(4);
            return { status: false, msg: "Plugin not support search" }
        }

        console.log("begin download", this.name);
        //获取详情
        let iComic = new iComicCtrl();
        let book_detail

        this.set_status(1);

        let retry_count = Number(this.plugin.config?.retry_count) || 5;
        //循环获取详情防止报错
        for (let i = 0; i < retry_count; i++) {
            try {
                book_detail = await this.plugin.getDetail(this.search_result);

                if (book_detail?.status === false) {
                    console.error(`Retry:`, i + 1, `Plugin[${this.plugin.name}][getDetail]Error:${book_detail.msg}`);

                    if (i == retry_count - 1) {
                        throw new Error(book_detail.msg);
                    }
                } else {
                    break;
                }
            } catch (error) {
                this.set_status(4);
                this.errors.push(`Plugin[${this.plugin.name}][getDetail]Error:${error.message}`);
                return { status: false, msg: `Plugin[${this.plugin.name}][getDetail]失败:${error.message}` }
            }
        }

        this.errors = [];
        //从详情里获取标题也页面配置
        let pages = book_detail.pages;
        let page_count = pages.length;

        //设置保存文件路径
        let save_dir = path.join(this.library_path, this.name);

        //设置临时目录
        let tmp_dir = path.join(save_dir, "._parts");
        if (!fs.existsSync(tmp_dir)) {
            //不存在就创建
            fs.mkdirSync(tmp_dir, { recursive: true });
        }

        await this.set_page_count(page_count);

        //判断cover_image是否已经生成
        let cover_image_path = path.join(tmp_dir, "0.part");
        let save_cover_image_success = false;
        if (fs.existsSync(cover_image_path)) {
            save_cover_image_success = true;
        } else {
            //不存在就创建
            //处理封面图
            console.log("begin download cover:", book_detail.cover_image);

            let cover_retry_count = Number(this.plugin.config?.retry_count) || 5;
            let result = null;
            //循环获取缩略图防止报错
            for (let i = 0; i < cover_retry_count; i++) {
                try {
                    result = await iComic.get(book_detail.cover_image).then((res) => {
                        // console.log("download cover success:", res);
                        return { status: true, data: res.body };
                    }).catch((err) => {
                        return { status: false, msg: err.message };
                    });
                    if (result.status) {
                        break;
                    } else {
                        console.error(`Retry:`, i + 1, `Plugin[${this.plugin.name}][getCover]Error:${result.msg}`);

                        if (i == cover_retry_count - 1) {
                            throw new Error(result.msg);
                        }
                    }
                } catch (error) {
                    this.set_status(4);
                    this.errors.push(`Plugin[${this.plugin.name}][getCover]Error:${error.message}`);
                    return { status: false, msg: `Plugin[${this.plugin.name}][getCover]失败:${error.message}` }
                }
            }

            let cbz_cover_file = new yazl.ZipFile();

            if (result.status) {
                cbz_cover_file.addBuffer(result.data, `cover/cover.png`);

                console.log("download cover success:", book_detail.cover_image);

                cbz_cover_file.end();

                //存储cover_image
                save_cover_image_success = await this.saveFileByZip(cbz_cover_file, cover_image_path);

                if (save_cover_image_success === true) {
                    console.log("save cover success:", cover_image_path);
                }
            } else {
                console.log("download cover error:", result.msg);
            }

            cbz_cover_file = null;
        }

        //判断是否是更新任务
        if (this.type == 1) {
            this.set_page_complete_count(this.cur_page_index);
        }

        //从上次断点继续下载
        console.log("begin download", this.name, "all Pages");
        const pageDownloader = new PageDownloader(this, this.plugin, pages, tmp_dir, iComic);
        const page_result = await pageDownloader.downloadPages(this.cur_page_index);

        // 收集错误
        this.errors = this.errors.concat(page_result.errors);

        if (this.status == 1) {
            let save_file_path = path.join(save_dir, this.name + (await this.plugin.saveFileExtension()));
            let part_files = fs.readdirSync(tmp_dir)
                .filter(file => path.extname(file) == ".part")
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            //判断是否是更新任务
            if (this.type == 1) {
                //如果save_file_path存在就添加到part_files第一位
                if (fs.existsSync(save_file_path)) {
                    // 强制移动到临时目录并改名为0_1.part
                    fs.renameSync(save_file_path, path.join(tmp_dir, "0_1.part"));
                    // 添加到首位
                    part_files.unshift("0_1.part");
                }
                if (this.update_library_id) {
                    // 并将library记录状态改为0
                    await this.helpers.db_query.run('UPDATE library SET status = 0 WHERE id = ?', [this.update_library_id]);
                }
            }

            let part_zip = new yazl.ZipFile();

            // 动态并发控制配置
            let cpu_count = os.cpus().length;
            let concurrency = 1;
            let completed = 0;

            concurrency = (Number(this.plugin.config?.merge_concurrency) || cpu_count);
            concurrency = Math.min(concurrency, cpu_count);

            const limit = pLimit(concurrency);

            console.log("Begin merge part count:", part_files.length, `concurrency`, concurrency);

            try {
                await Promise.all(part_files.map(file =>
                    limit(async () => {
                        const zipPath = path.join(tmp_dir, file);
                        const fileNum = path.basename(file, ".part");

                        let read_zip = null;

                        try {
                            read_zip = new StreamZip.async({ file: zipPath });
                            try {
                                const entries = await read_zip.entries();

                                for (const entry of Object.values(entries)) {
                                    if (entry.isFile) {
                                        try {
                                            let fileBuffer = await read_zip.entryData(entry.name);
                                            part_zip.addBuffer(fileBuffer, entry.name);    
                                        } catch (error) {
                                            console.error(`Error reading file ${entry.name} from ${zipPath}: ${error}`);
                                        }
                                    }
                                }
                            } finally {
                                read_zip && await read_zip.close();
                                read_zip = null;
                            }

                            completed++;
                            console.log(completed, "/", part_files.length, `Merge completed, part:${fileNum}`);
                        } catch (e) {
                            console.error(`Merge part ${fileNum} error:`, e);
                            throw e; // 抛出错误以终止整个合并流程
                        }
                    })
                ));

                // 最终写入

                part_zip.end();

                let save_result = await this.saveFileByZip(part_zip, save_file_path);

                //清除内存占用？？？
                part_zip = null;

                if (!save_result) throw new Error(`File save failed:${save_result.message}`);

                // 后续清理和状态更新逻辑保持不变...
                //删除临时目录和文件
                fs.rmSync(tmp_dir, { recursive: true });

                //存储config.json
                let json_dir = path.join(this.library_path, this.name);
                let json_path = path.join(json_dir, this.name + ".json");

                //不写入到库,留给用户解析
                let config_json = {
                    "name": this.name,
                    "author": book_detail.author,
                    "page_count": page_count,
                    "tags": book_detail.tags,
                    "description": book_detail.description,
                    "search_plugin": this.plugin_id,
                    "search_result": this.search_result,
                    "page_list": []
                }

                //确保目录存在
                fs.mkdirSync(json_dir, { recursive: true });
                //将json文件写入
                fs.writeFileSync(json_path, JSON.stringify(config_json, null, 2));

                // 自动扫描入库，让书直接出现在首页（失败不影响合并结果，可手动扫描兜底）
                this.helpers.library.scan(this.helpers).then((ret) => {
                    console.log(`[download] Auto scan after merge: added=${ret && ret.i18n ? ret.i18n.added : '?'}`);
                }).catch((e) => {
                    console.error(`[download] Auto scan failed:`, e.message);
                });

                console.log(`Download ${this.name} finish`, `success:${this.page_complete_count},fail:${this.page_fail_count}`);

                //console.log(`内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);

                //下载完成
                this.set_status(2);

                //下载完成，调用回掉
                this.nextTask();
            } catch (e) {
                if (part_zip && !part_zip._ended) {
                    part_zip.end();
                }
                part_zip = null;
                this.set_status(3);
                this.errors.push(`Merge error: ${e.message}`);
            }
        } else if (this.status == 4) {
            console.log(`download ${this.name} pause`, `success:${this.page_complete_count},fail:${this.page_fail_count}`);
        } else if (this.status == 5) {
            console.log(`download ${this.name} delete`, `success:${this.page_complete_count},fail:${this.page_fail_count}`);
        }
    }

    pause() {
        //
        this.set_status(4);
    }

    delete() {
        // 取消排程中的合并
        if (this.merge_timer) {
            clearTimeout(this.merge_timer);
            this.merge_timer = null;
        }
        this.set_status(5);
    }

    /**
     * 按需下载模式：只获取元数据和封面，不下载内容页
     */
    async beginOnDemand() {
        this.errors = [];

        if (!this.plugin && this.plugin_id) {
            this.plugin = this.helpers.plugin.getPlugin(this.plugin_id);
        }

        if (this.plugin?.type !== "search") {
            this.errors.push(`Plugin[${this.plugin_id}]not support search`);
            this.set_status(3);
            return { status: false, msg: "Plugin not support search" };
        }

        // 元数据已就绪（失败重试/暂停恢复/重启恢复）：直接回到按需可读状态，避免重新拉取并清空已下载进度
        if (this.book_meta) {
            this.status = 6;
            await this.helpers.db_query.run('UPDATE download_task SET status = ? WHERE id = ?', [6, this.id]);
            // 若所有页已下载但尚未合并（合并失败后重试），重新排程合并
            this.checkAndMerge();
            return { status: true, msg: "server.task_active", data: {
                task_id: this.id,
                name: this.name,
                page_count: this.book_meta.page_count
            }};
        }

        let iComic = new iComicCtrl();
        let book_detail;

        this.set_status(1);

        let retry_count = Number(this.plugin.config?.retry_count) || 5;
        for (let i = 0; i < retry_count; i++) {
            try {
                book_detail = await this.plugin.getDetail(this.search_result);
                if (book_detail?.status === false) {
                    if (i == retry_count - 1) throw new Error(book_detail.msg);
                } else {
                    break;
                }
            } catch (error) {
                this.set_status(3);
                this.errors.push(`Plugin[${this.plugin.name}][getDetail]Error:${error.message}`);
                return { status: false, msg: `Plugin[${this.plugin.name}][getDetail]失败:${error.message}` };
            }
        }

        this.errors = [];
        let pages = book_detail.pages;
        let page_count = pages.length;

        if (!fs.existsSync(this.save_dir)) {
            fs.mkdirSync(this.save_dir, { recursive: true });
        }
        if (!fs.existsSync(this.tmp_dir)) {
            fs.mkdirSync(this.tmp_dir, { recursive: true });
        }

        // 下载封面
        let cover_image_path = path.join(this.tmp_dir, "0.part");
        if (!fs.existsSync(cover_image_path)) {
            let cover_retry_count = Number(this.plugin.config?.retry_count) || 5;
            let result = null;
            for (let i = 0; i < cover_retry_count; i++) {
                try {
                    result = await iComic.get(book_detail.cover_image).then((res) => {
                        return { status: true, data: res.body };
                    }).catch((err) => {
                        return { status: false, msg: err.message };
                    });
                    if (result.status) break;
                    if (i == cover_retry_count - 1) throw new Error(result.msg);
                } catch (error) {
                    this.set_status(3);
                    return { status: false, msg: `Plugin[${this.plugin.name}][getCover]失败:${error.message}` };
                }
            }

            if (result?.status) {
                let cbz_cover_file = new yazl.ZipFile();
                cbz_cover_file.addBuffer(result.data, `cover/cover.png`);
                cbz_cover_file.end();
                await this.saveFileByZip(cbz_cover_file, cover_image_path);
                cbz_cover_file = null;
            }
        }

        // 保存元数据（seen_page_count 记录用户看过的目录页数，用于下次打开时标注新增页）
        this.book_meta = {
            name: this.name,
            author: book_detail.author,
            tags: book_detail.tags,
            description: book_detail.description,
            cover_image: book_detail.cover_image,
            page_count: page_count,
            pages: pages,
            seen_page_count: page_count
        };

        await this.helpers.db_query.run(
            'UPDATE download_task SET book_meta = ?, page_count = ?, downloaded_pages = ?, status = 6 WHERE id = ?',
            [JSON.stringify(this.book_meta), page_count, JSON.stringify([]), this.id]
        );

        this.status = 6;
        this.page_count = page_count;
        this.page_complete_count = 0;

        return { status: true, msg: "server.success", data: {
            task_id: this.id,
            name: this.name,
            page_count: page_count
        }};
    }

    /**
     * 按需下载单页（并发防重入：同一页只允许一个下载任务）
     */
    async downloadSinglePage(pageIndex) {
        if (!this.book_meta) {
            return { status: false, msg: "server.book_meta_not_ready" };
        }

        // 服务重启后 scanAllTask 先于异步插件加载，这里按需补取插件引用
        if (!this.plugin && this.plugin_id) {
            this.plugin = this.helpers.plugin.getPlugin(this.plugin_id);
        }
        if (!this.plugin) {
            return { status: false, msg: "server.no_plugin" };
        }

        if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= this.book_meta.page_count) {
            return { status: false, msg: "server.invalid_page" };
        }

        if (this.downloaded_pages.includes(pageIndex)) {
            return { status: true, msg: "already downloaded" };
        }

        if (this.downloading_pages.has(pageIndex)) {
            return this.downloading_pages.get(pageIndex);
        }

        let job = this.doDownloadSinglePage(pageIndex).finally(() => {
            this.downloading_pages.delete(pageIndex);
        });
        this.downloading_pages.set(pageIndex, job);
        return job;
    }

    async doDownloadSinglePage(pageIndex) {
        let part_path = path.join(this.tmp_dir, `${pageIndex + 1}.part`);
        if (fs.existsSync(part_path)) {
            // 断电/重启恢复：part 已存在但可能缺块数记录，从分片本身读出并补记
            let block_count = 0;
            try {
                let read_zip = new StreamZip.async({ file: part_path });
                let entries = await read_zip.entries();
                block_count = Object.values(entries).filter(e => e.isFile).length;
                await read_zip.close();
            } catch (e) {
                console.error(`[on-demand] read part ${part_path} error:`, e.message);
            }

            if (block_count <= 0) {
                // 空分片视为损坏，删除后重新下载
                try { fs.unlinkSync(part_path); } catch (e) { }
            } else {
                if (!this.book_meta.page_block_counts) {
                    this.book_meta.page_block_counts = [];
                }
                if (!this.book_meta.page_block_counts[pageIndex]) {
                    this.book_meta.page_block_counts[pageIndex] = block_count;
                    await this.helpers.db_query.run(
                        'UPDATE download_task SET book_meta = ? WHERE id = ?',
                        [JSON.stringify(this.book_meta), this.id]
                    );
                }

                this.downloaded_pages.push(pageIndex);
                this.downloaded_pages.sort((a, b) => a - b);
                await this.saveDownloadedPages();

                this.page_complete_count = this.downloaded_pages.length;
                await this.helpers.db_query.run(
                    'UPDATE download_task SET page_complete_count = ? WHERE id = ?',
                    [this.page_complete_count, this.id]
                );

                await this.checkAndMerge();

                return { status: true, msg: "already downloaded" };
            }
        }

        let iComic = new iComicCtrl();
        let page = this.book_meta.pages[pageIndex];

        let page_detail;
        let retry_count = Number(this.plugin.config?.retry_count) || 5;
        for (let i = 0; i < retry_count; i++) {
            try {
                page_detail = await this.plugin.getPageDetail(page);
                if (page_detail?.status === false) {
                    if (i == retry_count - 1) throw new Error(page_detail?.msg);
                } else {
                    break;
                }
            } catch (e) {
                this.errors.push(`getPageDetail[${pageIndex}] Error: ${e.message}`);
                return { status: false, msg: e.message };
            }
        }

        let page_detail_title = this.safePathName(page_detail.title);
        let page_detail_blocks = page_detail.blocks;

        let page_zip = new yazl.ZipFile();
        let downloader = new BlockDownloader(this, page_zip, page_detail_title, pageIndex, iComic);
        let { errors } = await downloader.downloadAll(page_detail_blocks);
        // 页内所有块已结算，进度条使命完成
        this.page_progress.delete(pageIndex);

        if (errors.length > 0) {
            page_zip.end();
            if (!page_zip._ended) {
                try { page_zip.outputStream.destroy(); } catch (e) { }
            }
            return { status: false, msg: errors.join('; ') };
        }

        page_zip.end();

        let save_result = await this.saveFileByZip(page_zip, part_path);
        if (!save_result) {
            return { status: false, msg: "save failed" };
        }

        this.downloaded_pages.push(pageIndex);
        this.downloaded_pages.sort((a, b) => a - b);
        await this.saveDownloadedPages();

        // 记录该页块数
        if (!this.book_meta.page_block_counts) {
            this.book_meta.page_block_counts = [];
        }
        this.book_meta.page_block_counts[pageIndex] = page_detail_blocks.length;
        await this.helpers.db_query.run(
            'UPDATE download_task SET book_meta = ? WHERE id = ?',
            [JSON.stringify(this.book_meta), this.id]
        );

        this.page_complete_count = this.downloaded_pages.length;
        await this.helpers.db_query.run(
            'UPDATE download_task SET page_complete_count = ? WHERE id = ?',
            [this.page_complete_count, this.id]
        );

        // 检查是否全部下载完成，自动合并
        await this.checkAndMerge();

        return { status: true, msg: "downloaded", data: {
            page_index: pageIndex,
            downloaded_count: this.downloaded_pages.length,
            total_pages: this.book_meta.page_count
        }};
    }

    /**
     * 获取页面下载状态
     */
    async getPageStatus() {
        let meta = this.book_meta || {};
        return {
            status: true,
            data: {
                task_id: this.id,
                name: this.name,
                status: this.status,
                content_type: await this.getContentContentType(),
                total_pages: meta.page_count || this.page_count || 0,
                downloaded_pages: this.downloaded_pages,
                downloaded_count: this.downloaded_pages.length,
                is_complete: this.is_complete,
                page_block_counts: meta.page_block_counts || [],
                // 目录列表：getDetail 返回并随 book_meta 持久化的每页标题
                page_titles: (meta.pages || []).map(p => (p && p.title) || ''),
                // 正在下载的页进度 { pageIndex: { done, total } }
                page_progress: Object.fromEntries(this.page_progress),
                book_meta: meta ? {
                    name: meta.name,
                    author: meta.author,
                    tags: meta.tags,
                    description: meta.description,
                    cover_image: meta.cover_image,
                    page_count: meta.page_count
                } : null
            }
        };
    }

    /**
     * 按需下载：重新拉取源站最新目录并与本地 book_meta.pages 对比。
     * apply=false 只返回差异（前端弹窗让用户确认，不写任何数据）；
     * apply=true 应用新目录：pages/page_count 入库，seen_page_count 之前的页在
     * 前端标注为"新"，任务回到按需可读状态（含已合并完成的书，新页可继续按需下载）
     */
    async refreshCatalog(apply = false) {
        if (this.type != 2) {
            return { status: false, msg: "server.not_on_demand" };
        }

        if (this.status == 5) {
            return { status: false, msg: "server.task_delete" };
        }

        if (!this.plugin && this.plugin_id) {
            this.plugin = this.helpers.plugin.getPlugin(this.plugin_id);
        }
        if (!this.plugin) {
            return { status: false, msg: "server.no_plugin" };
        }
        if (!this.book_meta) {
            return { status: false, msg: "server.book_meta_not_ready" };
        }

        // 重新拉取详情（插件返回失败时重试，异常直接返回，保证接口尽快响应）
        let book_detail;
        let retry_count = Math.min(Number(this.plugin.config?.retry_count) || 5, 2);
        for (let i = 0; i < retry_count; i++) {
            try {
                book_detail = await this.plugin.getDetail(this.search_result);
                if (book_detail?.status === false) {
                    if (i == retry_count - 1) throw new Error(book_detail.msg);
                } else {
                    break;
                }
            } catch (error) {
                return { status: false, msg: `Plugin[${this.plugin.name}][getDetail]失败:${error.message}` };
            }
        }

        let old_pages = this.book_meta.pages || [];
        let new_pages = (book_detail && Array.isArray(book_detail.pages)) ? book_detail.pages : [];
        let title_of = (p, i) => (p && p.title) || `第${i + 1}页`;

        // 按标题逐项比对新旧目录的公共前缀
        let common = 0;
        while (common < old_pages.length && common < new_pages.length &&
            title_of(old_pages[common], common) === title_of(new_pages[common], common)) common++;

        // 用户上次看过的目录页数：旧数据没有该字段时视为已知页全部看过
        let seen = Number(this.book_meta.seen_page_count);
        if (!Number.isInteger(seen) || seen < 0 || seen > old_pages.length) {
            seen = old_pages.length;
        }

        let append_only = common >= old_pages.length;
        let changed = !append_only || new_pages.length > old_pages.length;

        if (!apply) {
            let data = {
                changed: changed,
                append_only: append_only,
                total_pages: new_pages.length
            };

            if (changed && append_only) {
                data.new_pages = [];
                for (let i = old_pages.length; i < new_pages.length; i++) {
                    data.new_pages.push({ index: i, title: title_of(new_pages[i], i) });
                }
            } else if (changed) {
                // 非追加变化（插入/删除/改名）：列出前20条差异供弹窗展示
                data.old_total = old_pages.length;
                data.changes = [];
                let max_len = Math.max(old_pages.length, new_pages.length);
                for (let i = common; i < max_len && data.changes.length < 20; i++) {
                    let old_title = i < old_pages.length ? title_of(old_pages[i], i) : '';
                    let new_title = i < new_pages.length ? title_of(new_pages[i], i) : '';
                    // 两边都存在且标题相同的项不算差异
                    if (old_title && new_title && old_title === new_title) continue;
                    data.changes.push({ index: i, old_title, new_title });
                }
            }

            return { status: true, msg: "server.success", data };
        }

        if (!changed) {
            return { status: true, msg: "server.success", data: {
                changed: false,
                total_pages: old_pages.length,
                marked_from: seen
            } };
        }

        // 应用新目录
        let marked_from = Math.min(seen, old_pages.length);
        this.book_meta.pages = new_pages;
        this.book_meta.page_count = new_pages.length;
        // 本次已把新页展示给用户，更新"已看过"进度，下次打开只标注之后的新增
        this.book_meta.seen_page_count = new_pages.length;

        await this.helpers.db_query.run(
            'UPDATE download_task SET book_meta = ?, page_count = ? WHERE id = ?',
            [JSON.stringify(this.book_meta), new_pages.length, this.id]
        );
        this.page_count = new_pages.length;

        // 回到按需可读状态：新增页才能继续按需下载（已合并完成的书也一样）
        if (this.status != 6) {
            this.status = 6;
            await this.helpers.db_query.run('UPDATE download_task SET status = ? WHERE id = ?', [6, this.id]);
        }

        return { status: true, msg: "server.success", data: {
            changed: true,
            total_pages: new_pages.length,
            marked_from: marked_from
        } };
    }

    /**
     * 从 .part 文件读取块图片（分片已被合并清理时回退到合并后的 CBZ）
     */
    async getBlockFromPart(pageIndex, blockIndex) {
        let part_path = path.join(this.tmp_dir, `${pageIndex + 1}.part`);

        if (!fs.existsSync(part_path)) {
            // 分片已被合并清理：回退到合并后的 CBZ（仅按需任务有合并产物）
            if (this.type != 2) {
                return { status: false, msg: "server.page_not_downloaded" };
            }
            return await this.getBlockFromMerged(pageIndex, blockIndex);
        }

        let cacheKey = `${this.id}_${pageIndex}`;
        let cached = this.part_cache.get(cacheKey);

        if (!cached) {
            let zip = new StreamZip.async({ file: part_path });
            let entries = await zip.entries();
            let files = Object.values(entries).filter(e => e.isFile).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true })
            );
            cached = { zip, entries: files, timer: null };
            this.cachePart(cacheKey, cached);
        } else {
            // 命中缓存：刷新过期时间与 LRU 位置
            this.cachePart(cacheKey, cached);
        }

        let entry = cached.entries[blockIndex];
        if (!entry) {
            return { status: false, msg: "server.block_not_found" };
        }
        let fileExt = path.extname(entry.name).slice(1);
        let imageBuffer = await cached.zip.entryData(entry);
        if (this.isTextBlock(imageBuffer, entry.name)) {
            return { serverbacktype: 'txt', data: imageBuffer, ext: fileExt };
        }
        return { serverbacktype: 'image', data: imageBuffer, ext: fileExt };
    }

    /**
     * 从合并后的 CBZ 读取块图片（按合并时的分片顺序定位：封面 1 条 + 各页块数偏移）
     */
    async getBlockFromMerged(pageIndex, blockIndex) {
        // 优先用插件声明的扩展名定位合并产物；插件引用缺失（重启后异步加载未完成）时按通用后缀查找
        let merged_path = null;
        if (this.plugin) {
            try {
                let ext = await this.plugin.saveFileExtension();
                if (ext) merged_path = path.join(this.save_dir, this.name + ext);
            } catch (e) { }
        }
        if (!merged_path || !fs.existsSync(merged_path)) {
            try {
                if (fs.existsSync(this.save_dir)) {
                    let found = fs.readdirSync(this.save_dir).find(f =>
                        f.startsWith(this.name) && f !== this.name + '.json' &&
                        ['.cbz', '.ictz', '.zip'].includes(path.extname(f).toLowerCase()));
                    if (found) merged_path = path.join(this.save_dir, found);
                }
            } catch (e) { }
        }
        if (!merged_path || !fs.existsSync(merged_path)) {
            return { status: false, msg: "server.page_not_downloaded" };
        }

        let cacheKey = `merged_${this.id}`;
        let cached = this.part_cache.get(cacheKey);

        if (!cached) {
            let zip = new StreamZip.async({ file: merged_path });
            let entries = await zip.entries();
            // 不排序：保持中央目录顺序 = 合并时的分片顺序（封面在前，其后按页序）
            let files = Object.values(entries).filter(e => e.isFile);
            cached = { zip, entries: files, timer: null };
            this.cachePart(cacheKey, cached);
        } else {
            this.cachePart(cacheKey, cached);
        }

        let counts = this.book_meta ? (this.book_meta.page_block_counts || []) : [];
        let offset = 1; // 0.part 封面的 cover/cover.png
        for (let i = 0; i < pageIndex; i++) {
            if (!counts[i]) {
                return { status: false, msg: "server.block_not_found" };
            }
            offset += counts[i];
        }

        let entry = cached.entries[offset + blockIndex];
        if (!entry) {
            return { status: false, msg: "server.block_not_found" };
        }
        let fileExt = path.extname(entry.name).slice(1);
        let imageBuffer = await cached.zip.entryData(entry);
        if (this.isTextBlock(imageBuffer, entry.name)) {
            return { serverbacktype: 'txt', data: imageBuffer, ext: fileExt };
        }
        return { serverbacktype: 'image', data: imageBuffer, ext: fileExt };
    }

    /**
     * 判断块内容是文本还是图片：优先插件声明的 content_type，
     * 其次块文件扩展名，最后按魔数识别常见图片格式
     */
    isTextBlock(buffer, entryName) {
        if (this.plugin?.content_type === 'text') return true;
        if (this.plugin?.content_type === 'image') return false;
        let ext = path.extname(entryName || '').toLowerCase();
        if (['.txt', '.html', '.htm'].includes(ext)) return true;
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'].includes(ext)) return false;
        // 扩展名无法判断时按魔数识别
        if (buffer && buffer.length >= 12) {
            if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return false; // PNG
            if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return false; // JPEG
            if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return false; // GIF
            if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return false; // WebP
            if (buffer[0] === 0x42 && buffer[1] === 0x4D) return false; // BMP
        }
        return false;
    }

    /**
     * 获取按需任务的内容类型（image/text）。
     * 插件声明了 content_type 直接用；否则从已下载分片的块内容推断并缓存；
     * 还没有分片时返回 null。
     * 推断扫描临时目录里实际存在的页分片（不限于前5页：续读靠后章节时前面的页未必下载过），
     * 0.part 是封面，参与推断会把文本书误判成图片
     */
    async getContentContentType() {
        if (this.plugin?.content_type) return this.plugin.content_type;
        if (this._inferred_content_type) return this._inferred_content_type;
        try {
            let parts = fs.existsSync(this.tmp_dir)
                ? fs.readdirSync(this.tmp_dir)
                    .filter(file => {
                        let num = parseInt(file, 10);
                        return path.extname(file) == ".part" && Number.isInteger(num) && num >= 1;
                    })
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                    .slice(0, 5)
                : [];

            for (let file of parts) {
                let part_path = path.join(this.tmp_dir, file);
                let zip = new StreamZip.async({ file: part_path });
                try {
                    let entries = Object.values(await zip.entries()).filter(e => e.isFile);
                    if (entries.length === 0) continue;
                    let entry = entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))[0];
                    let buffer = await zip.entryData(entry);
                    this._inferred_content_type = this.isTextBlock(buffer, entry.name) ? 'text' : 'image';
                    return this._inferred_content_type;
                } finally {
                    await zip.close();
                }
            }
        } catch (e) {
            console.error('[on-demand] infer content type error:', e.message);
        }
        return null;
    }

    /**
     * 获取按需任务封面（0.part 封面包内的第一张图）
     */
    async getCoverFromPart() {
        let cover_path = path.join(this.tmp_dir, "0.part");
        if (!fs.existsSync(cover_path)) {
            return { status: false, msg: "server.no_file" };
        }
        let zip = new StreamZip.async({ file: cover_path });
        try {
            let entries = Object.values(await zip.entries()).filter(e => e.isFile);
            if (entries.length === 0) {
                return { status: false, msg: "server.no_file" };
            }
            let buffer = await zip.entryData(entries[0]);
            let ext = path.extname(entries[0].name).slice(1) || "jpeg";
            return { serverbacktype: 'image', data: buffer, ext };
        } finally {
            await zip.close();
        }
    }

    /**
     * 分片缓存写入/刷新：带过期时间与 LRU 上限，防止文件句柄无限积累
     */
    cachePart(key, val) {
        clearTimeout(val.timer);
        val.timer = setTimeout(async () => {
            try { await val.zip.close(); } catch (e) { }
            this.part_cache.delete(key);
        }, 10 * 60 * 1000);
        this.part_cache.delete(key);
        this.part_cache.set(key, val);
        while (this.part_cache.size > MAX_PART_CACHE) {
            const oldestKey = this.part_cache.keys().next().value;
            const oldest = this.part_cache.get(oldestKey);
            this.part_cache.delete(oldestKey);
            clearTimeout(oldest.timer);
            try { oldest.zip.close(); } catch (e) { }
        }
    }

    /**
     * 检查是否全部下载完成，排程延迟合并
     * is_complete 只在合并成功后置位：合并失败可重试，重启后也能自愈
     */
    async checkAndMerge() {
        if (!this.book_meta || this.is_complete) return;

        let total_pages = this.book_meta.page_count;
        if (this.downloaded_pages.length < total_pages) return;

        // 延迟合并：分片在合并前保持可读，正在进行的阅读会话不受影响
        if (this.merge_timer) return;

        console.log(`[on-demand] All ${total_pages} pages downloaded for ${this.name}, merge scheduled in ${ON_DEMAND_MERGE_DELAY_MS / 1000}s...`);
        this.merge_timer = setTimeout(() => {
            this.merge_timer = null;
            if (this.status == 4 || this.status == 5) return;
            this.mergeAndFinish().catch((e) => {
                console.error(`[on-demand] Merge error for ${this.name}:`, e.message);
                this.errors.push(`Merge error: ${e.message}`);
                this.set_status(3);
            });
        }, ON_DEMAND_MERGE_DELAY_MS);
    }

    /**
     * 合并所有 .part 文件为 CBZ（is_complete 仅在成功后置位）
     */
    async mergeAndFinish() {
        if (!this.book_meta || this.merging) return;
        this.merging = true;

        try {
            await this.doMergeAndFinish();
        } finally {
            this.merging = false;
        }
    }

    async doMergeAndFinish() {
        let save_file_path = path.join(this.save_dir, this.name + (await this.plugin.saveFileExtension()));

        if (!fs.existsSync(this.tmp_dir)) {
            this.set_status(3);
            return;
        }

        let part_files = fs.readdirSync(this.tmp_dir)
            .filter(file => path.extname(file) == ".part")
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        let part_zip = new yazl.ZipFile();
        let cpu_count = os.cpus().length;
        let concurrency = Math.min(Number(this.plugin.config?.merge_concurrency) || cpu_count, cpu_count);
        const limit = pLimit(concurrency);

        try {
            await Promise.all(part_files.map(file =>
                limit(async () => {
                    const zipPath = path.join(this.tmp_dir, file);
                    let read_zip = null;
                    try {
                        read_zip = new StreamZip.async({ file: zipPath });
                        const entries = await read_zip.entries();
                        for (const entry of Object.values(entries)) {
                            if (entry.isFile) {
                                try {
                                    let fileBuffer = await read_zip.entryData(entry.name);
                                    part_zip.addBuffer(fileBuffer, entry.name);
                                } catch (error) {
                                    console.error(`Error reading ${entry.name} from ${zipPath}: ${error}`);
                                }
                            }
                        }
                    } finally {
                        read_zip && await read_zip.close();
                    }
                })
            ));

            part_zip.end();
            let save_result = await this.saveFileByZip(part_zip, save_file_path);
            part_zip = null;

            if (!save_result) throw new Error(`File save failed`);

            fs.rmSync(this.tmp_dir, { recursive: true });

            // 写入 config.json
            let json_path = path.join(this.save_dir, this.name + ".json");
            let config_json = {
                "name": this.name,
                "author": this.book_meta.author,
                "page_count": this.book_meta.page_count,
                "tags": this.book_meta.tags,
                "description": this.book_meta.description,
                "search_plugin": this.plugin_id,
                "search_result": this.search_result,
                "page_list": []
            };
            fs.mkdirSync(this.save_dir, { recursive: true });
            fs.writeFileSync(json_path, JSON.stringify(config_json, null, 2));

            // 自动扫描入库，让书直接出现在首页（失败不影响合并结果，可手动扫描兜底）
            this.helpers.library.scan(this.helpers).then((ret) => {
                console.log(`[on-demand] Auto scan after merge: added=${ret && ret.i18n ? ret.i18n.added : '?'}`);
            }).catch((e) => {
                console.error(`[on-demand] Auto scan failed:`, e.message);
            });

            // 清理缓存
            for (const [key, val] of this.part_cache) {
                clearTimeout(val.timer);
                try { await val.zip.close(); } catch (e) { }
            }
            this.part_cache.clear();

            console.log(`[on-demand] Merged ${this.name}: ${this.downloaded_pages.length} pages`);

            // 合并成功后才置位 is_complete：失败时保持 0，可重试、重启后可自愈
            this.is_complete = 1;
            await this.helpers.db_query.run(
                'UPDATE download_task SET is_complete = ? WHERE id = ?',
                [this.is_complete, this.id]
            );

            this.set_status(2);
            this.nextTask && this.nextTask();
        } catch (e) {
            if (part_zip && !part_zip._ended) {
                part_zip.end();
            }
            part_zip = null;
            this.set_status(3);
            this.errors.push(`Merge error: ${e.message}`);
            console.error(`[on-demand] Merge error for ${this.name}:`, e.message);
        }
    }

    async saveDownloadedPages() {
        await this.helpers.db_query.run(
            'UPDATE download_task SET downloaded_pages = ? WHERE id = ?',
            [JSON.stringify(this.downloaded_pages), this.id]
        );
    }

    /**
     * 将页加入串行预下载队列（避免并发请求打爆源站）
     */
    queuePageDownload(pageIndex) {
        if (this.downloaded_pages.includes(pageIndex)) return false;
        if (this.prefetch_queued.has(pageIndex)) return false;
        this.prefetch_queued.add(pageIndex);
        this.prefetch_queue.push(pageIndex);
        this.pumpPrefetchQueue();
        return true;
    }

    async pumpPrefetchQueue() {
        if (this.prefetch_pumping) return;
        this.prefetch_pumping = true;
        try {
            while (this.prefetch_queue.length > 0) {
                // 任务被暂停/删除时清空队列
                if (this.status == 4 || this.status == 5) {
                    this.prefetch_queue = [];
                    this.prefetch_queued.clear();
                    break;
                }
                let pageIndex = this.prefetch_queue.shift();
                this.prefetch_queued.delete(pageIndex);
                try {
                    await this.downloadSinglePage(pageIndex);
                } catch (e) {
                    this.errors.push(`prefetch page[${pageIndex}] Error: ${e.message}`);
                }
            }
        } finally {
            this.prefetch_pumping = false;
        }
    }

    /**
     * 清理 part 缓存
     */
    clearPartCache() {
        for (const [key, val] of this.part_cache) {
            clearTimeout(val.timer);
            try { val.zip.close(); } catch (e) { }
        }
        this.part_cache.clear();
    }
}

class download {
    helpers = null;
    library_path = null;
    tasks = [];

    getAllTasks() {
        let tasks = this.tasks.map(task => {
            let result = {
                id: task.id,
                name: task.name,
                type: task.type,
                status: task.status,
                page_count: task.page_count,
                page_complete_count: task.page_complete_count,
                page_fail_count: task.page_fail_count,
                current_page_count: task.current_page_count,
                current_page_complete_count: task.current_page_complete_count,
                current_page_fail_count: task.current_page_fail_count,
                errors: task.errors
            };
            // 按需下载任务附加信息
            if (task.type == 2) {
                result.is_complete = task.is_complete;
                result.downloaded_pages = task.downloaded_pages;
                result.downloaded_count = task.downloaded_pages.length;
                result.book_meta = task.book_meta ? {
                    name: task.book_meta.name,
                    author: task.book_meta.author,
                    tags: task.book_meta.tags,
                    description: task.book_meta.description,
                    cover_image: task.book_meta.cover_image,
                    page_count: task.book_meta.page_count
                } : null;
            }
            return result;
        });

        return { status: true, data: tasks };
    }

    init(helpers, library_path) {
        //
        this.helpers = helpers;
        this.library_path = library_path;

        this.scanAllTask();
        //不自动开始任务
        //this.nextTask();
    }

    //扫描所有任务
    scanAllTask() {
        //查询状态等于1和0的
        // 0已添加未开始 1正在下载 2下载完成 3下载失败 4暂停下载 5已删除
        //const tasks = this.helpers.db_query.get('SELECT id,plugin_id,name,search_result,status,page_count FROM download_task');
        const tasks = this.helpers.db_query.all('SELECT * FROM download_task');

        tasks?.forEach(task => {
            this.tasks.push(new download_task(task.id, this.helpers, this.library_path, () => {
                this.nextTask();
            }));
        });
    }

    nextTask() {
        let curTaskWait = null;
        let curTask = null;
        let curWorkingTask = null;

        for (let i = 0; i < this.tasks.length; i++) {
            const task = this.tasks[i];
            if (task.type == 2) continue; // 跳过按需下载任务
            if (task.status == 4 && !curTaskWait) {
                curTaskWait = task;
            } else if (task.status == 0 && !curTask) {
                curTask = task;
            } else if (task.status == 1 && !curWorkingTask) {
                curWorkingTask = task;
            }
        }

        if (curWorkingTask) {
            return { status: true, msg: "server.task_running" }
        } else if (curTaskWait) {
            curTaskWait.begin();
            return { status: true, msg: "server.task_begin" }
        } else if (curTask) {
            curTask.begin();
            return { status: true, msg: "server.task_begin" }
        }
    }

    add(task_id) {
        //先查询是否有这个任务在tasks中
        let task = this.tasks.find(task => task.id == task_id);

        if (task) {
            return { status: false, msg: "server.task_has" }
        } else {
            this.tasks.push(new download_task(task_id, this.helpers, this.library_path, () => {
                this.nextTask();
            }));

            return { status: true, msg: "server.success" }
        }
    }

    begin(task_id) {
        let task = this.tasks.find(task => task.id == task_id);

        if (task) {
            // 按需下载任务走不同流程
            if (task.type == 2) {
                if (task.status == 6) {
                    return { status: true, msg: "server.task_active" };
                }
                if (task.status == 2) {
                    return { status: false, msg: "server.task_complete" };
                }
                task.beginOnDemand().catch((e) => {
                    task.errors.push(`beginOnDemand Error: ${e.message}`);
                    task.set_status(3);
                });
                return { status: true, msg: "server.task_begin" };
            }

            let curWorkingTask = this.tasks.find(t => t.id != task_id && t.type != 2 && t.status == 1);
            if (curWorkingTask) {
                return { status: false, msg: "server.task_running" };
            } else {
                task.begin();
                return { status: true, msg: "server.task_begin" };
            }
        } else {
            return { status: false, msg: "server.no_task" };
        }
    }

    getTask(task_id) {
        return this.tasks.find(task => task.id == task_id);
    }

    pause(task_id) {
        //先查询是否有这个任务在tasks中
        let task = this.tasks.find(task => task.id == task_id);

        if (task) {
            task.pause();
            return { status: true, msg: "server.task_pause" }
        } else {
            return { status: false, msg: "server.no_task" }
        }
    }

    delete(task_id) {
        //
        let task = this.tasks.find(task => task.id == task_id);

        if (task) {
            task.delete();
            this.tasks = this.tasks.filter(task => task.id != task_id);

            return { status: true, msg: "server.success" };
        } else {
            return { status: false, msg: "server.no_task" }
        }
    }
}

module.exports = download