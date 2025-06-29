const fs = require('fs');
const path = require('path');
class library {
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
        const existingRecords = helpers.db_query.all('SELECT path, config_path FROM library');
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

        // 3. 找出需要处理的文件（新增/更新）
        const newOrUpdatedFiles = scanFiles.filter(file => {
            // 文件路径不存在于数据库 -> 新增
            if (!existingPaths.has(file.path)) return true;

            return false;
        });

        // 4. 找出需要删除的文件（数据库中存在但文件系统中不存在）
        const deletedFiles = existingRecords.filter(record => {
            return !scanFiles.some(file => file.path === record.path) &&
                !fs.existsSync(record.path); // 双重验证
        });

        // 5. 处理新增/更新的文件
        let addedCount = 0;
        for (let file of newOrUpdatedFiles) {
            try {
                const config = file.config;
                const isNew = !existingPaths.has(file.path);

                // 新增记录
                if (isNew) {
                    helpers.db_query.run(
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
                    addedCount++;
                }

                // 处理标签（仅新增记录或配置更新时）
                if (config?.tags && Array.isArray(config.tags)) {
                    const libraryId = isNew ?
                        helpers.db_query.get('SELECT last_insert_rowid() as id').id :
                        helpers.db_query.get('SELECT id FROM library WHERE path = ?', [file.path]).id;

                    for (const tagName of config.tags) {
                        if (!tagName) continue;

                        let tag = helpers.db_query.get('SELECT id FROM tag WHERE name = ?', [tagName]);
                        if (!tag) {
                            helpers.db_query.run('INSERT INTO tag (name) VALUES (?)', [tagName]);
                            tag = { id: helpers.db_query.get('SELECT last_insert_rowid() as id').id };
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

        // 将数据库状态改为1（解析中）
        helpers.db_query.run('UPDATE library SET status = 1 WHERE id = ?', [library_id]);

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
                            helpers.db_query.run('UPDATE library SET status = 3 WHERE id = ?', [library_id]);
                            console.log('write config.json error:', e);
                            return;
                        }
                        // 解析成功，将状态改为2
                        console.log('parse', library.name, 'success');
                        //更新数据库(name,page_count,author,description,status)
                        helpers.db_query.run('UPDATE library SET name = ?,page_count = ?,author = ?,description = ?,status = ? WHERE id = ?', [config.name, config.page_count, config.author, config.description, 2, library_id]);
                        //helpers.db_query.run('UPDATE library SET status = 2 WHERE id = ?', [library_id]);
                    } else {
                        // 解析失败，将状态改为3
                        console.log("parse", "error", 'config is empty');
                        helpers.db_query.run('UPDATE library SET status = 3 WHERE id = ?', [library_id]);
                    }
                },
                (errMsg) => {
                    // 解析失败，将状态改为3
                    console.log("parse", "error", errMsg);
                    helpers.db_query.run('UPDATE library SET status = 3 WHERE id = ?', [library_id]);
                }
            );
        } catch (error) {
            plugin_result_error = error;
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
            // 根据library.path来获取后缀名
            const ext = path.extname(library.path);
            // 获取所有type为parser的插件
            const plugs = helpers.plugin.getPluginsByType("parser");

            //console.log(ext, library.path);

            for (const plug of plugs) {
                // 判断插件是否支持该后缀
                if (plug.support_file.includes(ext)) {
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