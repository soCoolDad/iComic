const fs = require('fs');
const path = require('path');

// 单个文件的解析超时：插件的 parseFile 只有「成功回调」和「失败回调」两条出口，
// 若两个都不调用，library.status 会永久停在 1（前端一直显示“正在解析”）
const PARSE_TIMEOUT_MS = 10 * 60 * 1000;

class library {
    // 正在解析中的 library id：同一文件重复点击解析时，两个 parseFile 会互相覆写 config.json 与 status
    parsingLibraries = new Set();

    init(libraryDir) {
        //
        this.libraryDir = libraryDir
    }

    /**
     * 递归扫描libraryDir下所有非json文件，同步数据库
     * @param {object} helpers - helpers对象，需包含db_query
     *   helpers.db_query 数据库处理   
     *   先清空library表
     *   清空library_tag表
     *   根据this.libraryDir扫描本地library里所有的文件，优先读取对应名称.json
     *   对应名称.json
     *        {
     *            "name": "name",
     *            "type": "comic",
     *            "author": "",
     *            "page_count": 0,
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
     * 如果JSON存在将name，page_count,tags,description,page_list, path(文件路径), config_path(配置文件路径)存入数据库
     * 如果tags不为空就存入tag表，如果tag名称重复，就直接关联,并在library_tag表中建立关联,library_id和tag_id
     * 如果没有JSON,那么只存入name, path, config_path,name用文件名代替
     * library status 0已添加未解析 1解析中 2解析完成 3解析失败
    */
    async scan(helpers) {
        // 1. 获取当前数据库中的所有文件记录
        const existingRecords = helpers.db_query.all('SELECT id, path, config_path FROM library');
        const existingPaths = new Set(existingRecords.map(record => record.path));
        
        // 2. 扫描文件系统获取最新文件列表
        let plugins = helpers.plugin.getPluginsByType('parser');
        let scanFiles = [];
        for (let plugin of plugins) {
            try {
                let search_result = await plugin.scan(this.libraryDir);

                let search_files = search_result.map(file => {
                    file.config.parse_plugin = plugin.id;
                    file.config.search_plugin = file.config?.search_plugin ? file.config?.search_plugin : "";

                    return file;
                });

                scanFiles = scanFiles.concat(search_files);
            } catch (error) {
                console.error(`插件扫描失败: ${plugin.id}`, error.message);
            }
        }

        // 3. 找出需要处理的文件（新增）
        const newFiles = scanFiles.filter(file => {
            // 文件路径不存在于数据库 -> 新增
            if (!existingPaths.has(file.path)) return true;

            return false;
        });

        // 4. 找出需要删除的文件（数据库中存在但文件系统中不存在）
        const deletedFiles = existingRecords.filter(record => {
            return !scanFiles.some(file => file.path === record.path) &&
                !fs.existsSync(record.path); // 双重验证
        });

        // 5. 处理新增的文件
        let addedCount = 0;
        for (let file of newFiles) {
            try {
                const config = file.config;

                // 新增记录
                const ret = helpers.db_query.run(
                    `INSERT INTO library (name, page_count, author, description, path, config_path, search_plugin, parse_plugin, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?,?, 0)`,
                    [
                        config?.name || path.basename(file.path),
                        config?.page_count || 0,
                        config?.author || '',
                        config?.description || '',
                        file.path,
                        file.config_path,
                        file.config.search_plugin,
                        file.config.parse_plugin
                    ]
                );
                const libraryId = ret.lastInsertRowid;
                addedCount++;

                // 处理标签
                if (config?.tags && Array.isArray(config.tags)) {
                    for (const tagName of config.tags) {
                        if (!tagName) continue;

                        let tag = helpers.db_query.get('SELECT id FROM tag WHERE name = ?', [tagName]);
                        if (!tag) {
                            const tagRet = helpers.db_query.run('INSERT INTO tag (name) VALUES (?)', [tagName]);
                            tag = { id: tagRet.lastInsertRowid };
                        }

                        helpers.db_query.run(
                            'INSERT OR IGNORE INTO library_tag (library_id, tag_id) VALUES (?, ?)',
                            [libraryId, tag.id]
                        );
                    }
                }

                // 保存配置文件（如果存在）
                if (config && file.config_path) {
                    fs.writeFileSync(file.config_path, JSON.stringify(config, null, 2));
                }
            } catch (error) {
                console.error(`处理文件失败: ${file.path}`, error);
            }
        }

        // 6. 处理删除的文件
        let deletedCount = 0;
        for (let record of deletedFiles) {
            try {
                helpers.db_query.run('DELETE FROM library WHERE path = ?', [record.path]);
                helpers.db_query.run('DELETE FROM library_tag WHERE library_id = ?', [record.id]);
                helpers.db_query.run('DELETE FROM library_progress WHERE library_id = ?', [record.id]);

                deletedCount++;
            } catch (error) {
                console.error(`删除记录失败: ${record.path}`, error);
            }
        }

        return {
            status: true,
            msg: `server.scan_complete`,
            i18n: {
                total: scanFiles.length,
                added: addedCount,
                deleted: deletedCount
            }
        };
    }

    /**
     * 解析library文件，调用插件并更新数据库状态
     * @param {object} helpers - helpers对象，需包含db_query、plugin
     * @param {number} library_id - library表主键
     * @param {number} plugin_id - 插件主键
     * @returns {object} 解析启动结果
     *   helpers.db_query 数据库处理   
     *   plugs = helpers.plugin.getPluginsByType("parser")   插件处理
     *   plug.parseFile(file_path,config_path,cbx_success,cbx_error)
     * 
     *   根据library_id获取对应的library
     *   根据plugin_id获取对应的插件
     * 
     *   判断library.path是否存在
     *   如果不存在返回{status:false,msg:"文件不存在"}
     * 
     *   调用插件解析
     *   将数据库状态改为1
     *   plugin.parseFile(library_path,config_path，（config）=>{
     *              如果config不为空
     *              返回解析结果存储到JSON,替换原来的内容
     *              解析成功，将状态改为2
     *              console.log('parse 文件名 success')
     *              如果为空
     *              解析失败，将状态改为3
     *              console.log('parse err:config is empty')
     *          },(errMgs)=>{
     *              解析失败，将状态改为3
     *              console.log(errMgs)
     *          })
     *
     * 
     *   返回{status:true,msg:"开始解析"}
     */
    parseByPluginId(helpers, library_id, plugin_id) {
        // 根据library_id获取对应的library
        const library = helpers.db_query.get('SELECT * FROM library WHERE id = ?', [library_id]);

        if (!library) {
            console.log("未找到library记录");
            return { status: false, msg: "server.no_file" };
        }

        // 根据plugin_id获取对应的插件
        const plugin = helpers.plugin.getPlugin(plugin_id);
        if (!plugin) {
            console.log("未找到插件");
            return { status: false, msg: "server.no_plugin" };
        }

        // 判断library.path是否存在
        if (!fs.existsSync(library.path)) {
            console.log("文件不存在");
            return { status: false, msg: "server.no_file" };
        }

        // 并发锁：同一文件重复点击解析时，两个 parseFile 会互相覆写 config.json 与 status。
        // 已在解析中就直接返回，不重复启动
        if (this.parsingLibraries.has(library_id)) {
            console.log('parse', library.name, 'already parsing, skip');
            return { status: true, msg: "server.parse_begin" };
        }
        this.parsingLibraries.add(library_id);

        // 将数据库状态改为1（解析中）
        helpers.db_query.run('UPDATE library SET status = 1 WHERE id = ?', [library_id]);

        // 兜底超时：插件若一个回调都不调用，status 会永久停在 1
        let settled = false;
        const parse_timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            console.log('parse', library.name, 'timeout');
            helpers.db_query.run('UPDATE library SET status = 3 WHERE id = ?', [library_id]);
            this.parsingLibraries.delete(library_id);
        }, PARSE_TIMEOUT_MS);

        // 收尾：标记已结束、清定时器、释放并发锁
        const settle = () => {
            settled = true;
            clearTimeout(parse_timer);
            this.parsingLibraries.delete(library_id);
        };

        //插件执行结果状态
        let plugin_result_error = null;
        // 调用插件解析
        try {
            plugin.parseFile(
                library.path,
                library.config_path,
                (config) => {
                    if (config) {
                        // 返回解析结果存储到JSON,替换原来的内容
                        try {
                            fs.writeFileSync(library.config_path, JSON.stringify(config, null, 2), 'utf-8');
                        } catch (e) {
                            settle();
                            helpers.db_query.run('UPDATE library SET status = 3 WHERE id = ?', [library_id]);
                            console.log('write config.json error:', e);
                            return;
                        }
                        // 解析成功，将状态改为2
                        console.log('parse', library.name, 'success');
                        settle();
                        //更新数据库(name,page_count,author,description,status)
                        helpers.db_query.run('UPDATE library SET name = ?,page_count = ?,author = ?,description = ?,status = ? WHERE id = ?', [config.name, config.page_count, config.author, config.description, 2, library_id]);
                        //helpers.db_query.run('UPDATE library SET status = 2 WHERE id = ?', [library_id]);
                    } else {
                        // 解析失败，将状态改为3
                        console.log("parse", "error", 'config is empty');
                        settle();
                        helpers.db_query.run('UPDATE library SET status = 3 WHERE id = ?', [library_id]);
                    }
                },
                (errMsg) => {
                    // 解析失败，将状态改为3
                    console.log("parse", "error", errMsg);
                    settle();
                    helpers.db_query.run('UPDATE library SET status = 3 WHERE id = ?', [library_id]);
                }
            );
        } catch (error) {
            plugin_result_error = error;
            settle();
            console.log("parseAllBySupportFile", "error", error);
        }

        if (plugin_result_error) {
            return { status: false, msg: `${plugin_result_error}` };
        } else {
            return { status: true, msg: "server.parse_begin" };
        }
    }

    parseAllBySupportFile(helpers) {
        // 获取所有未解析的library
        //const libraries = helpers.db_query.all('SELECT * FROM library WHERE status = 0');
        const libraries = helpers.db_query.all('SELECT * FROM library');

        let parseCount = 0;
        for (const library of libraries) {
            // 根据library.path来获取后缀名（统一转小写，否则 a.CBZ 这类大写后缀会被静默跳过）
            const ext = path.extname(library.path || '').toLowerCase();
            // 获取所有type为parser的插件
            const plugs = helpers.plugin.getPluginsByType("parser");

            //console.log(ext, library.path);

            for (const plug of plugs) {
                // 判断插件是否支持该后缀（插件声明的大小写同样按小写比较）
                if (Array.isArray(plug.support_file) &&
                    plug.support_file.some(s => String(s).toLowerCase() === ext)) {
                    parseCount++;
                    this.parseByPluginId(helpers, library.id, plug.id);
                    break;
                }
            }
        }

        return {
            status: true,
            msg: `server.parse_begin_multi`,
            i18n: {
                parse_count: parseCount,
                file_count: libraries.length
            }
        }
    }
}

module.exports = library