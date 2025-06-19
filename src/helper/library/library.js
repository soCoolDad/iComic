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
        // 先清空library表
        helpers.db_query.run('DELETE FROM library');
        // 清空library_tag表
        helpers.db_query.run('DELETE FROM library_tag');

        let plugins = helpers.plugin.getPluginsByType('file-parser');
        let scan_files = [];

        for (let i = 0; i < plugins.length; i++) {
            let plugin = plugins[i];
            try {
                scan_files = scan_files.concat(await plugin.scan(this.libraryDir));
            } catch (error) {
                console.log(error.message);
                continue;
            }
        }

        /*处理返回的文件
        *scan_file={
        *   name:"xxx",
        *   path:"xxx",
        *   config_path:"xxx",
        *   plugin_id:"xxx",
        *   config:{}
        *}
        */

        let scan_file_count = 0;
        for (let i = 0; i < scan_files.length; i++) {
            let scan_file = scan_files[i];
            let libraryId;
            let config = scan_file.config;
            let file_name, file_path, config_path,plugin_id;

            file_name = scan_file.name || "";
            file_path = scan_file.path;
            config_path = scan_file.config_path;
            plugin_id = scan_file.plugin_id;

            if (config) {
                try {
                    // 有config.json，插入library表
                    const info = helpers.db_query.run(
                        `INSERT INTO library (name, page_count, author, description, path, config_path, plugin_id,status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
                        [
                            config.name || file_name,
                            config.page_count || 0,
                            config.author || '',
                            config.description || '',
                            file_path,
                            config_path,
                            plugin_id
                        ]
                    );

                    libraryId = info.lastInsertRowid;

                    // 处理tags
                    if (Array.isArray(config.tags)) {
                        for (const tagName of config.tags) {
                            if (!tagName) continue;
                            // 查找tag是否已存在
                            let tag = helpers.db_query.get('SELECT id FROM tag WHERE name = ?', [tagName]);
                            let tagId;
                            if (!tag) {
                                // 不存在则插入
                                const tagInfo = helpers.db_query.run('INSERT INTO tag (name) VALUES (?)', [tagName]);
                                tagId = tagInfo.lastInsertRowid;
                            } else {
                                tagId = tag.id;
                            }
                            // 建立library_tag关联
                            helpers.db_query.run(
                                'INSERT OR IGNORE INTO library_tag (library_id, tag_id) VALUES (?, ?)',
                                [libraryId, tagId]
                            );
                        }
                    }

                    //存储config的json到config_path
                    try {
                        fs.writeFileSync(config_path, JSON.stringify(config, null, 2));
                        scan_file_count++;
                    } catch (error) {
                        console.log(`save ${config.name} config to ${config_path} failed`, error);
                    }
                } catch (error) {
                    console.log(`save ${config.name} config to db failed`, error);
                }
            } else {
                //不做任何动作
            }
        }

        return {
            status: true,
            msg: `发现${scan_files.length}个文件`
        }
    }

    /**
     * 解析library文件，调用插件并更新数据库状态
     * @param {object} helpers - helpers对象，需包含db_query、plugin
     * @param {number} library_id - library表主键
     * @param {number} plugin_id - 插件主键
     * @returns {object} 解析启动结果
     *   helpers.db_query 数据库处理   
     *   plugs = helpers.plugin.getPluginsByType("file-parser")   插件处理
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
            return { status: false, msg: "未找到library记录" };
        }

        // 根据plugin_id获取对应的插件
        const plugin = helpers.plugin.getPlugin(plugin_id);
        if (!plugin) {
            console.log("未找到插件");
            return { status: false, msg: "未找到插件" };
        }

        // 判断library.path是否存在
        if (!fs.existsSync(library.path)) {
            console.log("文件不存在");
            return { status: false, msg: "文件不存在" };
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
            return { status: true, msg: "开始解析" };
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
            // 获取所有type为file-parser的插件
            const plugs = helpers.plugin.getPluginsByType("file-parser");

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
            msg: `开始解析${parseCount}个文件,共${libraries.length}个文件`
        }
    }
}

module.exports = library