const fs = require('fs');
class library {
    async getAllLibrary(req, res, helpers) {
        //return helpers.db_query.get('SELECT * FROM library')
        //return helpers.library.getAllLibrary();

        const libraries = helpers.db_query.all('SELECT id, name, page_count, author, description, search_plugin, parse_plugin, status FROM library');

        libraries.forEach(library => {
            //通过library_tag和tag表联查tag.name
            //library.tags = helpers.db_query.all('SELECT * FROM library_tag WHERE library_id = ?', [library.id]);
            library.tags = helpers.db_query.all('SELECT tag.id, tag.name FROM library_tag LEFT JOIN tag ON library_tag.tag_id = tag.id WHERE library_tag.library_id = ?', [library.id]);

            let read_result = helpers.db_query.get('SELECT read_page_progress,read_update_time FROM library_progress WHERE library_id = ?', [library.id]);
            library.read_page_progress = read_result?.read_page_progress || 0;
            library.read_update_time = read_result?.read_update_time || 0;
        });

        return {
            status: true,
            data: libraries
        }
    }

    async getLibraryConfigByID(library_id, helpers) {
        let ret = await helpers.db_query.get('SELECT config_path FROM library WHERE id = ?', [library_id]);
        let config_path = ret?.config_path;

        //检查文件存在不存在
        if (config_path && fs.existsSync(config_path)) {
            let config = JSON.parse(fs.readFileSync(config_path, 'utf-8'));

            config.cover_image = "";

            return {
                status: true,
                data: config
            }
        } else {
            return {
                status: false,
                msg: "server.file_no_parse"
            }
        }
    }

    async getLibraryConfig(req, res, helpers) {
        let library_id = req.body.library_id || req.query.library_id;
        return await this.getLibraryConfigByID(library_id, helpers);
    }

    async getLibraryUpdate(req, res, helpers) {
        try {
            let library_id = req.body.library_id || req.query.library_id;
            let config_result = await this.getLibraryConfigByID(library_id, helpers);
            let plugin = null;

            if (config_result.status) {
                let config = config_result.data;

                //console.log(config);

                if (config.search_plugin && config.search_result) {
                    plugin = helpers.plugin.getPlugin(config.search_plugin);

                    if (plugin) {
                        if (plugin.type === "search") {
                            config.search_result;
                            let retry_count = Number(plugin.config?.retry_count) || 5;
                            let book_detail = null;
                            //循环获取详情防止报错
                            for (let i = 0; i < retry_count; i++) {
                                try {
                                    book_detail = await plugin.getDetail(config.search_result);

                                    if (book_detail?.status === false) {
                                        console.error(`Retry:`, i + 1, `Plugin[${plugin.name}][getDetail]Error:${book_detail.msg}`);

                                        if (i == retry_count - 1) {
                                            throw new Error(book_detail.msg);
                                        }
                                    } else {
                                        break;
                                    }
                                } catch (error) {
                                    throw error;
                                }
                            }

                            let pages = book_detail.pages;
                            let page_count = pages.length;

                            return {
                                status: true,
                                msg: "server.success",
                                data: {
                                    update_count: page_count - config.page_count,
                                    updata_data: config.search_result
                                }
                            }
                        }

                        return {
                            status: false,
                            msg: "server.plugin_cant_support_search"
                        }
                    }

                    return {
                        status: false,
                        msg: "server.no_plugin"
                    }
                }

                return {
                    status: false,
                    msg: "server.no_config"
                }
            }

            return config_result;
        } catch (error) {
            return {
                status: false,
                msg: "server.error",
                i18n: {
                    msg: error.message
                }
            }
        }
    }

    async getLibraryById(req, res, helpers) {
        let library_id = req.body.library_id || req.query.library_id;
        let need_config = req.body.need_config || req.query.need_config;

        let ret = await helpers.db_query.get('SELECT id, name, page_count, author, description, status, search_plugin, parse_plugin, config_path FROM library WHERE id = ?', [library_id]);

        if (!ret) {
            return { status: false, msg: "server.no_file" }
        }

        ret.tags = helpers.db_query.all('SELECT tag.id, tag.name FROM library_tag LEFT JOIN tag ON library_tag.tag_id = tag.id WHERE library_tag.library_id = ?', [ret.id]);

        let read_result = helpers.db_query.get('SELECT read_page_progress,read_update_time FROM library_progress WHERE library_id = ?', [ret.id]);
        ret.read_page_progress = read_result?.read_page_progress || 0;
        ret.read_update_time = read_result?.read_update_time || 0;

        if (need_config) {
            let config_path = ret.config_path;
            //检查文件存在不存在
            if (config_path && fs.existsSync(config_path)) {
                let config = JSON.parse(fs.readFileSync(config_path, 'utf-8'));

                config.cover_image = "";
                ret.config = config;
            }
        }

        ret.config_path = undefined;

        return { status: true, data: ret };
    }

    async scan(req, res, helpers) {
        let ret = await helpers.library.scan(helpers);

        return ret;
    }

    async parseAll(req, res, helpers) {
        let ret = await helpers.library.parseAllBySupportFile(helpers);

        return ret;
    }

    async parse(req, res, helpers) {
        let library_id = req.body.library_id || req.query.library_id;
        let plugin_id = req.body.plugin_id || req.query.plugin_id;
        let ret = await helpers.library.parseByPluginId(helpers, library_id, plugin_id);

        return ret;
    }

    async saveReadProgress(req, res, helpers) {
        let library_id = req.body.library_id || req.query.library_id;
        let read_page_progress = req.body.read_page_progress || req.query.read_page_progress;

        if (!library_id) {
            return {
                status: false,
                msg: "server.param_error",
                i18n: {
                    err: "library_id"
                }
            }
        }

        if (!read_page_progress === undefined) {
            return {
                status: false,
                msg: "server.param_error",
                i18n: {
                    err: "read_page_progress"
                }
            }
        }

        let has_read_progress = await helpers.db_query.get('SELECT * FROM library_progress WHERE library_id = ?', [library_id]);
        let ret;

        if (!has_read_progress) {
            //插入记录
            ret = await helpers.db_query.run('INSERT INTO library_progress (library_id, read_page_progress) VALUES (?, ?)', [library_id, read_page_progress]);
        } else {
            ret = await helpers.db_query.run('UPDATE library_progress SET read_page_progress = ?,read_update_time = CURRENT_TIMESTAMP WHERE library_id = ?', [read_page_progress, library_id]);
        }

        return {
            status: true,
            data: ret
        };
    }
}

module.exports = library;