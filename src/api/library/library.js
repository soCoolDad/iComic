const fs = require('fs');
const path = require('path');
class library {
    async getAllLibrary(req, res, helpers) {
        //return helpers.db_query.get('SELECT * FROM library')
        //return helpers.library.getAllLibrary();

        const libraries = helpers.db_query.all('SELECT id, name, page_count, author, description, plugin_id, status FROM library');

        libraries.forEach(library => {
            //通过library_tag和tag表联查tag.name
            //library.tags = helpers.db_query.all('SELECT * FROM library_tag WHERE library_id = ?', [library.id]);
            library.tags = helpers.db_query.all('SELECT tag.id, tag.name FROM library_tag LEFT JOIN tag ON library_tag.tag_id = tag.id WHERE library_tag.library_id = ?', [library.id]);
            library.read_page_progress = helpers.db_query.get('SELECT read_page_progress FROM library_progress WHERE library_id = ?', [library.id])?.read_page_progress || 0;
        });

        return {
            status: true,
            data: libraries
        }
    }

    async getLibraryConfig(req, res, helpers) {
        let library_id = req.body.library_id || req.query.library_id;
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
                msg: "请先解析该文件"
            }
        }
    }

    async getLibraryById(req, res, helpers) {
        let library_id = req.body.library_id || req.query.library_id;
        let need_config = req.body.need_config || req.query.need_config;

        let ret = await helpers.db_query.get('SELECT id, name, page_count, author, description, status, plugin_id, config_path FROM library WHERE id = ?', [library_id]);

        if (!ret) {
            return { status: false, msg: "未找到文件" }
        }

        ret.tags = helpers.db_query.all('SELECT tag.id, tag.name FROM library_tag LEFT JOIN tag ON library_tag.tag_id = tag.id WHERE library_tag.library_id = ?', [ret.id]);
        ret.read_page_progress = helpers.db_query.get('SELECT read_page_progress FROM library_progress WHERE library_id = ?', [ret.id])?.read_page_progress || 0;

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

        if (!library_id || !read_page_progress === undefined) {
            return {
                status: false,
                msg: "参数错误"
            }
        }

        let has_read_progress = await helpers.db_query.get('SELECT * FROM library_progress WHERE library_id = ?', [library_id]);
        let ret;

        if (!has_read_progress) {
            //插入记录
            ret = await helpers.db_query.run('INSERT INTO library_progress (library_id, read_page_progress) VALUES (?, ?)', [library_id, read_page_progress]);
        } else {
            ret = await helpers.db_query.run('UPDATE library_progress SET read_page_progress = ? WHERE library_id = ?', [read_page_progress, library_id]);
        }

        return {
            status: true,
            data: ret
        };
    }
}

module.exports = library;