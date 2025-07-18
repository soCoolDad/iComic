const fs = require('fs');
class block_reader {
    cover(req, res, helpers) {
        //api/parse/cover?library_id=1
        const library_id = req.query.library_id

        if (library_id) {
            let config_path = helpers.db_query.get('SELECT config_path FROM library WHERE id = ?', [library_id])
            let cover_image = null //Buffer.from(cover_image_base64.cover_image, 'base64')
            let configJson = null;

            if (config_path && config_path.config_path && fs.existsSync(config_path.config_path)) {
                {
                    configJson = JSON.parse(fs.readFileSync(config_path.config_path, 'utf-8'));
                    if (configJson && configJson.cover_image) {
                        //data:image/png;base64,datas
                        let base64Data = configJson.cover_image.split(',')[1];
                        let fileExt = configJson.cover_image.split(';')[0].split('/')[1];

                        cover_image = Buffer.from(base64Data, 'base64');

                        return { serverbacktype: 'image', data: cover_image, ext: fileExt };
                    }
                }
            }

            return {
                status: false,
                message: 'not find image'
            }
        } else {
            return {
                status: false,
                message: 'library_id is required'
            };
        }
    }

    async block(req, res, helpers) {
        //api/parse/block?plugin_id=cbz_file_parse&library_id=1&page=1&image=600
        //console.log("req.query:", req.query);

        const plugin_id = req.query.pi;
        const library_id = req.query.li;
        const page = req.query.page;
        const block = req.query.block;

        //await new Promise(resolve => setTimeout(resolve, 1000 * 60));

        if (library_id && page && block && plugin_id) {
            let plugin = helpers.plugin.getPlugin(plugin_id);
            let library = helpers.db_query.get('SELECT path,config_path FROM library WHERE id = ?', [library_id]);

            if (!library) {
                return { status: false, msg: "server.no_file" };
            }

            if (!library.path) {
                return { status: false, msg: "server.no_file" };
            }

            if (!library.config_path) {
                return { status: false, msg: "server.no_config" };
            }

            let library_path = library.path;
            let library_config_path = library.config_path;

            if (!fs.existsSync(library_path)) {
                return { status: false, msg: "server.no_file" };
            }

            if (!fs.existsSync(library_config_path)) {
                return { status: false, msg: "server.no_config" };
            }

            if (!plugin) {
                return { status: false, msg: "server.no_plugin" };
            }

            return await plugin.parsePageBlock(library_path, library_config_path, page, block);
        } else {
            return {
                status: false,
                message: 'server.param_error',
                i18n:{
                    err:"pi(plugin_id) or li(library_id) or page or block"
                }
            };
        }
    }
}

module.exports = block_reader