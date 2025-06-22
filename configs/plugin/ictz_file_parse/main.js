/**
 * 解析ictz文件，并返回符合iComic规范的JSON内容
 * @param {string} file_path ictz文件路径
 * @param {string} config_path JSON路径
 * @param {function} cbx_success 成功回调
 * @param {function} cbx_error 失败回调
 * @returns {Promise<boolean>}
 */
class Ictz_File_Parse extends FileParserPlugin {
    /**
     * readZip
     * {
     *   path: string,
     *   zip: StreamZip,
     *   entries: Array,
     *   config_page_list: [],
     *   timer: timer       
     * }
     */
    read_request = {};

    readZips = [];
    //停止阅读10分钟后关闭zip释放内存
    autoCloseZipTimer = 1000 * 60 * 10;
    /**
    * 解析ictz文件，并返回符合iComic规范的JSON内容
    *   JSON
    *        {
    *            "name": "",
    *            "type": "comic",
    *            "author": "",
    *            "page_count": 0,
    *            "cover_image": "name.cover.png",
    *            "tags": ["", ""],
    *            "description": "",
    *            "page_list": [
    *               {
    *                   "title": "xxx",
    *                   "region_begin":0,
    *                   "region_end":100
    *               },
    *               {
    *                   "title": "xxx",
    *                   "region_begin":101,
    *                   "region_end":200
    *               }
    *            ]
    *        }
    * 判断file_path是否为ictz文件
    * 如果是，读取ictz文件，用来备用解析
    * 如果不是，调用cbx_error({status:false,msg:"不是ictz文件"});return false;
    * 判断config_path是否为JSON
    * 如果是，读取JSON，生成json对象，用来备用解析
    * 如果不是 就生成一个空json对象
    * {
    *       "name": "ictz文件名",
    *       "type": "comic",
    *       "page_count": "ictz文件的页数",
    *       "cover_image" "",
    *       "page_list": [],
    * }
    * 创建新的json对象，把之前的json对象的内容如果有值合并到新的json对象里    
    * 读取新的json对象.cover_image文件是否存在，如果存在就判断文件存在，如果不存在就读取ictz第一张图片作为cover_image,用base64编码
    * 
    * 解析ictz文件开始
    * 遍历ictz文件里的所有的文件,对文件名进行0-9这样的排序
    * 对文件路径进行判断
    * 如果路径是 /目录名/*.*
    * 生成page_list里面的page对象
    * {
    *    "title": 目录名,
    *    "region_begin":记录开始的次序,
    *    "region_end":记录结束的次序
    * }
    * 如果路径是 /*.* 没有目录结构
    * 生成page_list里面的page对象
    * {
    *    "title": 文件名,
    *    "region_begin":记录开始的次序,
    *    "region_end":记录结束的次序
    * }
    * 将page对象存储在page_list里面
    * 赋值给新的json对象page_list
    * 解析ictz文件结束
    * 调用cbx_success(新的json对象)
    * return true;
    */
    async parseFile(file_path, config_path, cbx_success, cbx_error) {
        // 判断file_path是否为ictz文件

        if (path.extname(file_path).toLowerCase() !== '.ictz') {
            cbx_error({ status: false, msg: "不是ictz文件" });
            return false;
        }

        // 读取ictz文件
        if (!iComic.existsSync(file_path)) {
            cbx_error({ status: false, msg: "ictz文件不存在" });
            return false;
        }

        // 判断config_path是否存在
        let configObj = {};
        if (config_path && iComic.existsSync(config_path)) {
            try {
                configObj = JSON.parse(iComic.readFileSync(config_path, 'utf-8'));
            } catch (e) {
                configObj = {};
            }
        }

        // 生成基础json对象
        const ictzName = path.basename(file_path, '.ictz');
        let newConfig = {
            name: ictzName,
            type: "text",
            author: "",
            page_count: 0,
            cover_image: "",
            tags: [],
            description: "",
            page_list: []
        };

        // 合并已有config内容
        Object.assign(newConfig, configObj);

        // 解析ictz文件
        let zip = null;
        try {
            const StreamZip = require('node-stream-zip');
            zip = new StreamZip.async({ file: file_path });

            // zip = await StreamZip.async({ file: 'your.zip' });

            const entries = await zip.entries();

            // 过滤图片文件和常见的系统文件
            const systemFiles = [
                '.DS_Store',
                'Thumbs.db',
                'thumbs.db',
                'desktop.ini',
                '.git',
                '.gitignore',
                '.gitattributes',
                '__MACOSX',
                'node_modules',
                'Icon\r' // 注意是 \r 回车符
            ];

            let txtFiles = Object.values(entries).map((e, index) => {
                return {
                    index,
                    name: e.name,
                    entry: e
                };
            }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

            // 生成page_list
            let page_list = [];
            let dirMap = {};
            let coverEntry = null;
            for (let i = 0; i < txtFiles.length; i++) {
                const txtFile = txtFiles[i];
                const entry = txtFile.entry;

                const dirPath = path.dirname(entry.name);
                const parts = path.basename(dirPath);

                //过滤目录，非图片文件，.开头文件 ._开头文件
                if (
                    entry.isDirectory ||
                    !/\.(txt)$/i.test(entry.name) ||
                    /^\./.test(entry.name) ||
                    /^\._/.test(entry.name) ||
                    systemFiles.some(f => entry.name.startsWith(f) || entry.name.includes('/' + f))
                ) {
                    continue; // 跳过该次循环，进入下一个 i
                }

                // 如果当前名称是 **/cover.* 或者 **/Cover.*
                // 强制生成cover_image
                if (/\/cover\..*$/i.test(entry.name)) {
                    // 处理 cover 文件
                    coverEntry = null;
                    newConfig.cover_image = "";
                    //console.log("find cover", entry.name);
                }

                if (!coverEntry && !newConfig.cover_image) {
                    // 处理cover_image
                    coverEntry = entry;

                    // base64编码
                    // console.log('coverBuffer', coverEntry)
                    const coverBuffer = await zip.entryData(coverEntry.name);
                    newConfig.cover_image = `data:image/${path.extname(coverEntry.name).slice(1)};base64,${coverBuffer.toString('base64')}`;
                }

                //if (i < 10) console.log(entry);

                if (parts.length > 1) {
                    // /目录名/*.*
                    const dir = parts;
                    if (!dirMap[dir]) {
                        dirMap[dir] = { title: dir, region: [] };
                    }

                    dirMap[dir].region.push(txtFile.index);
                } else {
                    // /*.* 没有目录结构
                    page_list.push({
                        title: path.basename(entry.name),
                        region: [txtFile.index]
                    });
                }
            }
            // 合并目录结构的page对象
            for (const key in dirMap) {
                page_list.push(dirMap[key]);
            }

            // 按title排序
            page_list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));

            newConfig.page_count = page_list.length;
            newConfig.page_list = page_list;

            await zip && zip.close();
            zip = undefined;
            cbx_success(newConfig);
            return true;
        } catch (e) {
            await zip && zip.close();
            zip = undefined;
            cbx_error({ status: false, msg: "ictz解析失败", error: e });
            return false;
        }
    }

    async parsePageBlock(file_path, config_path, page, block_index) {
        try {
            const md5 = require('crypto').createHash('md5');

            let fileZipCtl = null;

            let pathMd5 = md5.update(file_path).digest('hex');

            if (this.read_request[pathMd5] === undefined) {
                this.read_request[pathMd5] = 0;
            };

            this.read_request[pathMd5] += 1;

            //只允许一个zip解析
            for (let i = 0; i < 5; i++) {
                //重试两次
                fileZipCtl = this.readZips.find(zip => {
                    if (zip.path == file_path) {
                        return zip;
                    }
                });

                if (fileZipCtl) {
                    break;
                }

                if (this.read_request[pathMd5] == 1) {
                    break;
                } else if (this.read_request[pathMd5] > 1) {
                    //等待一秒，等待zip初始化
                    await new Promise((resolve) => {
                        setTimeout(() => {
                            resolve();
                        }, 500);
                    });
                }
            }

            if (!fileZipCtl) {
                if (!iComic.existsSync(file_path)) {
                    return { success: false, message: 'file not exists' }
                }

                if (!iComic.existsSync(config_path)) {
                    return { success: false, message: 'config not exists' }
                }

                let configJson = JSON.parse(iComic.readFileSync(config_path, 'utf-8'));

                if (!configJson) {
                    return { status: false, message: 'config is null' };
                }

                if (!configJson.page_list && configJson.page_list.length === 0) {
                    return { status: false, message: 'page is empty' };
                }

                if (!configJson.page_list[page]) {
                    return { status: false, message: 'not find page' };
                }

                if (!configJson.page_list[page].region && configJson.page_list[page].region.length === 0) {
                    return { status: false, message: 'page is empty' };
                }

                if (!configJson.page_list[page].region.includes(Number(block_index))) {
                    return { status: false, message: 'region not find block' };
                }

                let StreamZip = require('node-stream-zip');
                /**
                 *使用依赖包node-stream-zip
                 *主程序提供
                 * cheerio             用于解析html
                 * chokidar            用于文件监听
                 * node-stream-zip     用于读取zip
                 * p-limit             用于控制并发
                 * yazl                用于打包zip
                 *如果使用其他依赖需要在配置文件里面配置
                 *如使用node-stream-zip
                 * config.json
                 * {
                 *    ...
                 *    "need_install": true  告知程序需要安装
                 * }
                 * 
                 * package.json
                 * {
                 *      ...
                 *      dependencies: {
                 *          "node-stream-zip": "^1.13.0"
                 *      }
                 * }
                 * 
                 */

                let zip = new StreamZip.async({ file: file_path });
                let entries = await zip.entries();

                fileZipCtl = {
                    path: file_path,
                    zip: zip,
                    entries: Object.values(entries).map(e => e),
                    config_page_list: configJson.page_list,
                    timer: 0
                };

                this.readZips.push(fileZipCtl);
            }

            clearTimeout(fileZipCtl.timer);

            fileZipCtl.timer = setTimeout(async () => {
                let newReads = [];

                this.readZips.forEach(item => {
                    if (item.path !== file_path) {
                        newReads.push(item);
                    }
                });

                this.readZips = newReads;

                await fileZipCtl.zip.close();

                //释放内存？？？
                fileZipCtl = null;
                this.read_request[pathMd5] = 0;
                console.log('auto_close_zip', file_path);
            }, this.autoCloseZipTimer);

            let textBuffer = null;
            let textEntry = fileZipCtl.entries[block_index];
            let fileName = textEntry?.name || "";

            //console.log("textEntry", textEntry);

            //获取文件扩展名
            let fileExt = path.extname(fileName).slice(1);

            if (textEntry) {
                textBuffer = await fileZipCtl.zip.entryData(textEntry);

                if (textEntry.name.endsWith('.txt')) {
                    return { serverbacktype: 'txt', data: textBuffer, ext: fileExt };
                } else {
                    return { serverbacktype: 'txt', data: Buffer.from(`这不是一段有效的文本,它是${fileExt}格式的`), ext: fileExt };
                }
            } else {
                return { status: false, msg: 'ictz not find txt' }
            }
        } catch (error) {
            return { status: false, msg: error.message };
        }
    }

    async scan(library_path) {
        //
        let scan_files = [];

        console.log("plugin scan", this.id);

        let scanDir = (dir) => {
            const files = iComic.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = iComic.statSync(filePath);

                if (stat.isDirectory()) {
                    // 排除node_modules目录
                    if (file === 'node_modules') continue;
                    // 排除.开头的目录
                    if (file.startsWith('.')) continue;

                    scanDir(filePath); // 递归处理子目录
                } else if (stat.isFile()) {
                    // 排除json文件
                    //if (path.extname(filePath).toLowerCase() === '.json') continue;
                    // 排除没有扩展名的文件
                    //if (!path.extname(filePath)) continue;
                    // 排除.开头的文件
                    //if (file.startsWith('.')) continue;

                    //  只接受ictz文件
                    if (path.extname(filePath).toLowerCase() !== '.ictz') continue;

                    // 查找同名 config.json
                    const configPath = filePath.replace(path.extname(filePath), '.json');
                    let config = null;

                    if (iComic.existsSync(configPath)) {
                        try {
                            config = JSON.parse(iComic.readFileSync(configPath, 'utf-8'));
                        } catch (e) {
                            config = {
                                name: file,
                                author: '',
                                description: 'scan by iComic',
                                tags: [],
                                page_count: 0
                            };
                        }
                    }

                    scan_files.push({
                        plugin_id: this.id,
                        name: file,
                        path: filePath,
                        config_path: configPath,
                        config: config
                    });
                }
            }
        }

        // 从 this.libraryDir 开始递归
        scanDir(library_path);

        return scan_files;
    }
}

module.exports = {
    Plugin: Ictz_File_Parse
};