// 在文件头部添加
const os = require('os');
const pLimit = require('p-limit').default;

const fs = require('fs');
const path = require('path');
const yazl = require('yazl');
const StreamZip = require('node-stream-zip');
const { iComicCtrl } = require('../../units/iComic');

class BlockDownloader {
    constructor(task, page_zip, page_detail_title, i) {
        this.task = task;
        this.page_zip = page_zip;
        this.page_detail_title = page_detail_title;
        this.i = i;
        this.errors = [];

        // 动态并发控制配置
        let cpu_count = os.cpus().length;
        this.concurrency = (this.task.plugin?.config?.concurrency || cpu_count);;
        this.concurrency = Math.min(this.concurrency, cpu_count);
        // 使用pLimit控制并发
        this.limit = pLimit(this.concurrency);
    }

    async downloadAll(urls) {
        const downloadPromises = urls.map((url, j) =>
            this.limit(() => this.downloadWithRetry(url, j))
        );

        console.log(`开始下载`, urls.length, `个块，并发数:`, this.concurrency);

        const results = await Promise.all(downloadPromises);

        // 处理结果
        for (let j = 0; j < results.length; j++) {
            let result = results[j];

            if (result.status) {
                let filename = await this.task.plugin.saveBlockName(this.task.name, this.page_detail_title, urls[j], this.i, j);

                filename = this.task.safePathName(filename);

                this.page_zip.addBuffer(result.data, filename);
            } else {
                this.errors.push(`downloader ${this.page_detail_title}:block[${j}] 出错:${result.msg}`);
            }
        }

        return { errors: this.errors };
    }

    async downloadWithRetry(url, j, retries = 5) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (this.task.status !== 1) {
                    return { status: false, msg: '任务已暂停' };
                }

                console.log(`downloader`, this.page_detail_title, j, `尝试`, attempt, url);

                const result = await this.task.plugin.getPageDetailBlock(url);

                if (result.status === false) {
                    throw new Error(result.msg);
                }

                this.task.add_current_page_complete_count();
                return {
                    status: true,
                    data: await this.task.plugin.parseFile(result)
                };
            } catch (err) {
                console.log(`downloader`, this.page_detail_title, '块', j, '出错', url, err.message, err);
                if (attempt === retries) {
                    this.task.add_current_page_fail_count();
                    return { status: false, msg: err.message };
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
}

class download_task {
    plugin = null;
    errors = [];
    constructor(task_id, helpers, library_path, nextTask) {
        let task = helpers.db_query.get('SELECT * FROM download_task WHERE id=?', [task_id]);
        let plugin = helpers.plugin.getPlugin(task.plugin_id);
        //会存在plugin在初始化的时候还没加载完该任务就开始初始化
        //console.log("get download_task", task, task_id, plugin);

        this.id = task.id;
        this.plugin_id = task.plugin_id;
        this.name = this.safePathName(task.name);
        this.status = task.status == 1 ? 4 : task.status;

        this.cur_page_index = (task.page_complete_count + task.page_fail_count) || 0;
        this.page_count = task.page_count;
        this.page_complete_count = task.page_complete_count;
        this.page_fail_count = task.page_fail_count;
        this.current_page_count = task.current_page_count;
        this.current_page_complete_count = task.current_page_complete_count;
        this.current_page_fail_count = task.current_page_fail_count;
        this.search_result = JSON.parse(task.search_result);

        this.plugin = plugin;
        this.library_path = library_path;
        this.nextTask = nextTask;
        this.helpers = helpers;
    }

    async set_page_count(page_count) {
        //同步设置数据库
        this.page_count = page_count;
        await this.helpers.db_query.run('UPDATE download_task SET page_count = ? WHERE id = ?', [page_count, this.id]);
    }

    async add_page_complete_count() {
        //page_complete_count++
        //同步设置数据库
        this.page_complete_count++;
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

    saveFileByZip(zip, filePath) {
        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(filePath);
            const outputStream = zip.outputStream;

            // 设置5分钟超时防止永久挂起
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`[Timeout] 文件保存超时: ${filePath}`));
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
            this.errors.push(`插件[${this.plugin_id}]不提供下载`);
            return { status: false, msg: "该插件不提供下载" }
        }

        console.log("begin download", this.name);
        //获取详情
        let iComic = new iComicCtrl();
        let book_detail

        //循环获取详情防止报错
        for (let i = 0; i < 5; i++) {
            try {
                book_detail = await this.plugin.getDetail(this.search_result);

                if (book_detail?.status === false) {
                    console.error(`重试第${i + 1}次`, `插件[${this.plugin.name}]获取[getDetail]失败:${book_detail.msg}`);

                    if(i == 4){
                        throw new Error(book_detail.msg);   
                    }
                } else {
                    break;
                }
            } catch (error) {
                this.set_status(4);
                this.errors.push(`插件[${this.plugin.name}]获取[getDetail]失败:${error.message}`);
                return { status: false, msg: `插件[${this.plugin.name}]获取[getDetail]失败:${error.message}` }
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

        //判断cover_image是否已经生成
        let cover_image_path = path.join(tmp_dir, "0.part");
        let save_cover_image_success = false;
        if (fs.existsSync(cover_image_path)) {
            save_cover_image_success = true;
        } else {
            //不存在就创建
            //处理封面图
            //book_detail.cover_image = "https://xxxxx.png";
            console.log("begin download cover:", book_detail.cover_image);
            let result = await iComic.get(book_detail.cover_image).then((res) => {
                // console.log("download cover success:", res);
                return { status: true, data: res.body };
            }).catch((err) => {
                return { status: false, msg: err.message };
            });

            let cbz_cover_file = new yazl.ZipFile();

            if (result.status) {
                cbz_cover_file.addBuffer(result.data, `cover/cover.png`);

                console.log("download cover success:", book_detail.cover_image);

                cbz_cover_file.end();

                //存储cover_image
                save_cover_image_success = await this.saveFileByZip(cbz_cover_file, cover_image_path);

                if (save_cover_image_success == true) {
                    console.log("save cover success:", cover_image_path);
                }

                cbz_cover_file = null;
            } else {
                console.log("download cover error:", result.msg);
            }

            cbz_cover_file = null;
        }

        this.set_status(1);
        this.set_page_count(page_count);

        //从上次断点继续下载
        for (let i = this.cur_page_index; i < page_count; i++) {
            try {
                let page = pages[i];

                //获取page详情
                console.log("download page:", this.cur_page_index);

                let page_detail;
                //循环获取page详情防止报错
                for (let j = 0; j < 5; j++) {
                    try {
                        page_detail = await this.plugin.getPageDetail(page);

                        if (page_detail?.status === false) {
                            console.error(`重试第${j + 1}次`, `插件[${this.plugin.name}]获取[getPageDetail]失败:${page_detail?.msg}`);
                            if(j == 4){
                                throw new Error(page_detail?.msg);
                            }
                        } else {
                            break;
                        }
                    } catch (e) {
                        this.set_status(4);
                        this.errors.push(`插件[${this.plugin.name}]获取[getPageDetail]失败:${e.message}`);
                        return { status: false, msg: `插件[${this.plugin.name}]获取[getPageDetail]失败:${e.message}` }
                    }
                }

                let page_zip = new yazl.ZipFile();
                let page_zip_path = path.join(tmp_dir, `${i + 1}.part`);
                let page_detail_title = this.safePathName(page_detail.title);
                let page_detail_blocks = page_detail.blocks;
                let page_detail_has_error = false;

                console.log("begin download page:", page_detail_title, "共:", page_detail_blocks.length, "个块");

                this.set_current_page_count(page_detail_blocks.length);

                const downloader = new BlockDownloader(this, page_zip, page_detail_title, i, iComic);
                const { errors } = await downloader.downloadAll(page_detail_blocks);

                this.errors = this.errors.concat(errors);
                page_detail_has_error = errors.length > 0;

                console.log("save page:", page_detail_title, page_zip_path, "begin");

                //如果文件存在就删除文件
                if (fs.existsSync(page_zip_path)) {
                    fs.unlinkSync(page_zip_path);
                }

                page_zip.end();

                //提前存储cbz
                let save_result = await this.saveFileByZip(page_zip, page_zip_path);

                console.log("save page:", page_detail_title, page_zip_path, "complete");

                if (save_result !== true) {
                    this.errors.push(`save page ${page_detail_title} to ${page_zip_path} error`);
                    page_detail_has_error = true
                }

                //释放内存？？？
                page_zip = null;

                if (this.status != 1) {
                    //暂停下载
                    break;
                }

                this.cur_page_index++;

                if (page_detail_has_error) {
                    this.add_page_fail_count();
                } else {
                    this.add_page_complete_count();
                }

                console.log(`end download page ${page_detail_title} finished:`, `success:${this.page_complete_count}, fail:${this.page_fail_count}`);
            } catch (error) {
                this.errors.push(`处理page:${i}:失败:${error.message}`);
                console.error(`处理page:${i}:失败:${error.message}`, error);
                this.set_status(4);
                break;
            }
        }

        if (this.status == 1) {
            let save_file_path = path.join(save_dir, this.name + (await this.plugin.saveFileExtension()));
            let part_files = fs.readdirSync(tmp_dir)
                .filter(file => path.extname(file) == ".part")
                .sort((a, b) => parseInt(path.basename(a, ".part")) - parseInt(path.basename(b, ".part")));

            let part_zip = new yazl.ZipFile();

            // 动态并发控制配置
            let cpu_count = os.cpus().length;
            let concurrency = 1;

            concurrency = (this.plugin.config?.concurrency || cpu_count);;
            concurrency = Math.min(concurrency, cpu_count);

            const limit = pLimit(concurrency);
            let completed = 0;

            console.log(`开始合并 ${part_files.length} 个part文件，并发数: ${concurrency}`);

            try {
                await Promise.all(part_files.map(file =>
                    limit(async () => {
                        const zipPath = path.join(tmp_dir, file);
                        const fileNum = parseInt(path.basename(file, ".part"));

                        let read_zip = null;

                        try {
                            read_zip = new StreamZip.async({ file: zipPath });
                            try {
                                const entries = await read_zip.entries();

                                for (const entry of Object.values(entries)) {
                                    if (entry.isFile) {
                                        let fileBuffer = await read_zip.entryData(entry.name);
                                        part_zip.addBuffer(fileBuffer, entry.name);
                                    }
                                }
                            } finally {
                                read_zip && await read_zip.close();
                                read_zip = null;
                            }

                            completed++;
                            console.log(`[${completed}/${part_files.length}] 成功合并 part ${fileNum}`);
                        } catch (e) {
                            console.error(`合并 part ${fileNum} 失败:`, e);
                            throw e; // 抛出错误以终止整个合并流程
                        }
                    })
                ));

                // 最终写入

                part_zip.end();

                let save_result = await this.saveFileByZip(part_zip, save_file_path);

                //清除内存占用？？？
                part_zip = null;

                if (!save_result) throw new Error('最终CBZ文件保存失败');

                // 后续清理和状态更新逻辑保持不变...
                //删除临时目录和文件
                fs.rmSync(tmp_dir, { recursive: true });

                //存储config.json
                let json_dir = path.join(this.library_path, this.name);
                let json_path = path.join(json_dir, this.name + ".json");

                //不写入到库,留给用户解析
                let config_json = {
                    "name": this.name,
                    "type": "comic",
                    "author": book_detail.author,
                    "page_count": page_count,
                    "tags": book_detail.tags,
                    "description": book_detail.description,
                    "page_list": []
                }

                //判断是否存在json文件
                if (fs.existsSync(json_path)) {
                    //存在就删除文件
                    fs.unlinkSync(json_path);
                } else {
                    //不存在就创建文件
                    fs.mkdirSync(json_dir, { recursive: true });
                }
                //将json文件写入
                fs.writeFileSync(json_path, JSON.stringify(config_json, null, 2));

                console.log(`download ${this.name} finish`, `success:${this.page_complete_count},fail:${this.page_fail_count}`);

                //console.log(`内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);

                //下载完成
                this.set_status(2);

                //下载完成，调用回掉
                this.nextTask();
            } catch (e) {
                part_zip.end();
                part_zip = null;
                this.set_status(3);
                this.errors.push(`合并失败: ${e.message}`);
                //throw e;
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
        //
        this.set_status(5);
    }
}

class download {
    helpers = null;
    library_path = null;
    tasks = [];
    constructor() {
    }

    getAllTasks() {
        let tasks = this.tasks.map(task => {
            return {
                id: task.id,
                name: task.name,
                status: task.status,
                page_count: task.page_count,
                page_complete_count: task.page_complete_count,
                page_fail_count: task.page_fail_count,
                current_page_count: task.current_page_count,
                current_page_complete_count: task.current_page_complete_count,
                current_page_fail_count: task.current_page_fail_count,
                errors: task.errors
            }
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
        //优先开始状态为4的
        let curTaskWait = null;
        let curTask = null;
        let curWorkingTask = null;

        for (let i = 0; i < this.tasks.length; i++) {
            const task = this.tasks[i];
            if (task.status == 4 && !curTaskWait) {
                curTaskWait = task;
            } else if (task.status == 0 && !curTask) {
                curTask = task;
            } else if (task.status == 1 && !curWorkingTask) {
                curWorkingTask = task;
            }
        }

        if (curWorkingTask) {
            return { status: true, msg: "任务正在下载" }
        } else if (curTaskWait) {
            curTaskWait.begin();
            return { status: true, msg: "任务继续下载" }
        } else if (curTask) {
            curTask.begin();
            return { status: true, msg: "任务开始下载" }
        }
    }

    add(task_id) {
        //先查询是否有这个任务在tasks中
        let task = this.tasks.find(task => task.id == task_id);

        if (task) {
            return { status: false, msg: "任务已存在" }
        } else {
            this.tasks.push(new download_task(task_id, this.helpers, this.library_path, () => {
                this.nextTask();
            }));

            return { status: true, msg: "任务添加成功" }
        }
    }

    begin(task_id) {
        //先查询是否有这个任务在tasks中
        let task = this.tasks.find(task => task.id == task_id);

        if (task) {
            //再查询其他任务是否在下载中
            let curWorkingTask = this.tasks.find(task => task.status == 1);

            if (curWorkingTask) {
                return { status: false, msg: "任务正在下载中" }
            } else {
                task.begin();
                // console.log("begin download result", result, result.status);
                // if (result.status == "fulfilled") {
                //     return result;
                // }
                return { status: true, msg: "任务开始下载" }
            }
        } else {
            return { status: false, msg: "请先添加任务" }
        }
    }

    pause(task_id) {
        //先查询是否有这个任务在tasks中
        let task = this.tasks.find(task => task.id == task_id);

        if (task) {
            task.pause();
            return { status: true, msg: "任务暂停下载" }
        } else {
            return { status: false, msg: "任务不存在" }
        }
    }

    delete(task_id) {
        //
        let task = this.tasks.find(task => task.id == task_id);

        if (task) {
            task.delete();
            this.tasks = this.tasks.filter(task => task.id != task_id);

            return { status: true, msg: "任务删除成功" };
        } else {
            return { status: false, msg: "任务不存在" }
        }
    }
}

module.exports = download