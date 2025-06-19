const fs = require('fs');
const path = require('path');
class plugin {
    constructor() {

    }

    getPluginByType(req, res, helpers) {
        let type = req.body.type;
        let plugins = helpers.plugin.getPluginsByType(type);

        let backupPlugins = []

        plugins.map(item => {
            backupPlugins.push({
                id: item.id,
                name: item.name,
                type: item.type,
                version: item.version,
                description: item.description,
                placeholder: item.placeholder,
                need_install: item.need_install,
                installed: fs.existsSync(path.join(item.path, "node_modules"))
            });
        });

        return {
            status: true,
            data: backupPlugins
        }
    }

    getAllPlugins(req, res, helpers) {
        let allPlugins = helpers.plugin.getAllPlugins()
        let backupPlugins = []

        allPlugins.map(item => {
            backupPlugins.push({
                id: item.id,
                name: item.name,
                type: item.type,
                version: item.version,
                description: item.description,
                placeholder: item.placeholder,
                need_install: item.need_install,
                installed: fs.existsSync(path.join(item.path, "node_modules"))
            });
        });

        return {
            status: true,
            data: backupPlugins
        }
    }

    installPluginDependencies(req, res, helpers) {
        let pluginId = req.body.plugin_id;
        
        return helpers.plugin.installPluginDependencies(pluginId);
    }

    installAllPluginDependencies(req, res, helpers) {
        return helpers.plugin.installAllPluginDependencies();
    }
}

module.exports = plugin