class download {
    constructor() {

    }

    async search(req, res, helpers) {
        let keyword = req.body.keyword;
        let plugin_id = req.body.plugin_id;

        let plugin = helpers.plugin.getPlugin(plugin_id);

        if (plugin) {
            if (plugin?.type === "search") {
                let data = await plugin.search(keyword);

                if (data.status === false) {
                    return { status: false, msg: data.msg }
                }

                return { status: true, data }
            } else {
                return { status: false, msg: "server.plugin_cant_support_search" }
            }
        } else {
            return { status: false, msg: "server.no_plugin" }
        }
    }

    download(req, res, helpers) {
        //
        let plugin_id = req.body.plugin_id;
        let name = req.body.name;
        let search_result = req.body.search_result;

        let status = 0; // 0已添加未开始 1正在下载 2下载完成 3下载失败 4暂停下载 5删除

        let plugin = helpers.plugin.getPlugin(plugin_id);

        if (!name) {
            name = search_result.title;
        }

        if (plugin) {
            if (plugin?.type === "search") {
                //先查看有没有这个下载任务
                let task = helpers.db_query.get('SELECT * FROM download_task WHERE plugin_id = ? AND name = ?', [plugin_id, name]);

                if (task) {
                    return { status: false, data: { id: task.id }, msg: "server.task_has" }
                }

                //如果任务没有添加就添加到下载任务表
                let ret = helpers.db_query.run('INSERT INTO download_task(plugin_id,name,search_result,status) VALUES(?,?,?,?)', [plugin_id, name, JSON.stringify(search_result), status]);

                if (ret) {
                    //返回任务id
                    //console.log("add ret", ret);
                    let result = helpers.download.add(ret.lastInsertRowid);

                    return { status: result.status, data: { id: ret.lastInsertRowid }, msg: result.msg }
                } else {
                    return { status: false, msg: "server.error" }
                }
            } else {
                return { status: false, msg: "server.plugin_cant_support_search" }
            }
        } else {
            return { status: false, msg: "server.no_plugin" }
        }
    }
}

module.exports = download;