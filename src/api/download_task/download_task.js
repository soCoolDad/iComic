const fs = require('fs');

class download_task {
    getAllTasks(req, res, helpers) {
        return helpers.download.getAllTasks();
    }

    begin(req, res, helpers) {
        let task_id = req.body.task_id;
        return helpers.download.begin(task_id);
    }

    pause(req, res, helpers) {
        let task_id = req.body.task_id;
        return helpers.download.pause(task_id);
    }

    async delete(req, res, helpers) {
        let task_id = req.body.task_id;
        let task = helpers.download.getTask(task_id);
        if (task) {
            task.clearPartCache();
        }
        let result = helpers.download.delete(task_id);

        if (result?.status) {
            // 清理按需任务的临时分片目录（已合并的 CBZ 属于库文件，保留）
            if (task && task.type == 2 && task.tmp_dir && fs.existsSync(task.tmp_dir)) {
                try { fs.rmSync(task.tmp_dir, { recursive: true, force: true }); } catch (e) { }
            }
            await helpers.db_query.run('DELETE FROM download_task WHERE id=?', [task_id]);
        }

        return result;
    }

    async downloadPage(req, res, helpers) {
        let task_id = req.body.task_id;
        let page = Number(req.body.page);
        let task = helpers.download.getTask(task_id);

        if (!task) {
            return { status: false, msg: "server.no_task" };
        }

        if (task.type != 2) {
            return { status: false, msg: "server.not_on_demand" };
        }

        if (!task.book_meta) {
            return { status: false, msg: "server.book_meta_not_ready" };
        }

        return await task.downloadSinglePage(page);
    }

    async getPageStatus(req, res, helpers) {
        let task_id = req.query.task_id;
        let task = helpers.download.getTask(task_id);

        if (!task) {
            return { status: false, msg: "server.no_task" };
        }

        return await task.getPageStatus();
    }

    /**
     * 按需任务目录刷新：apply=false 只拉取最新目录并返回差异（前端弹窗确认），
     * apply=true 把最新目录写入任务并返回新页标注起点
     */
    async refreshCatalog(req, res, helpers) {
        let task_id = req.body.task_id;
        let apply = req.body.apply === true;
        let task = helpers.download.getTask(task_id);

        if (!task) {
            return { status: false, msg: "server.no_task" };
        }

        return await task.refreshCatalog(apply);
    }

    async getCover(req, res, helpers) {
        let task_id = req.query.task_id;
        let task = helpers.download.getTask(task_id);

        if (!task) {
            return { status: false, msg: "server.no_task" };
        }

        // 普通任务开始下载后也会有 0.part 封面；没有时返回 no_file 由前端占位
        return await task.getCoverFromPart();
    }

    async getBlock(req, res, helpers) {
        let task_id = req.query.task_id;
        let page = Number(req.query.page);
        let block = Number(req.query.block);
        let task = helpers.download.getTask(task_id);

        if (!task) {
            return { status: false, msg: "server.no_task" };
        }

        return await task.getBlockFromPart(page, block);
    }

    async prefetch(req, res, helpers) {
        let task_id = req.body.task_id;
        let pages = req.body.pages || [];
        let task = helpers.download.getTask(task_id);

        if (!task) {
            return { status: false, msg: "server.no_task" };
        }

        if (task.type != 2 || !task.book_meta) {
            return { status: false, msg: "server.not_on_demand" };
        }

        // 加入任务内的串行队列后台下载，不阻塞，避免并发打爆源站
        let queued = 0;
        for (let p of pages) {
            p = Number(p);
            if (!Number.isInteger(p) || p < 0 || p >= task.book_meta.page_count) continue;
            if (task.queuePageDownload(p)) queued++;
        }

        return { status: true, msg: "server.prefetch_started", i18n: { count: queued }, data: { pages: queued } };
    }
}

module.exports = download_task;
