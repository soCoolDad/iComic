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

    /**
     * 按需阅读单页下载：提交后立即返回，不等下载完成。
     * 下载进度与完成状态由 /api/download_task/events 长连接推送，
     * 避免整页下载耗时超过前端请求超时导致阅读页报错退出。
     */
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

        return task.requestPageDownload(page);
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
     * 任务事件长连接（SSE），替代前端定时轮询：
     * - 带 task_id：订阅单个任务，推送 status / progress / deleted 事件
     * - 不带 task_id：订阅全部任务，推送 tasks 事件（任务列表快照）
     *
     * 本方法自行接管响应（不返回 JSON），由 src/index.js 的路由放行。
     */
    events(req, res, helpers) {
        // SSE 要实时下发：反向代理（nginx）默认会缓冲响应体，显式关掉
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        // 浏览器断线后的重连间隔（毫秒）
        res.write('retry: 3000\n\n');

        const task_id = req.query.task_id ? String(req.query.task_id) : null;

        const send = (type, payload) => {
            if (res.writableEnded || res.destroyed) return;
            res.write(`event: ${type}\n`);
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        };

        // 任务已经不存在：告知前端并收尾，不让连接空挂
        if (task_id && !helpers.download.getTask(task_id)) {
            send('deleted', { task_id });
            res.end();
            return;
        }

        // 心跳：长时间没有数据的连接会被代理或浏览器掐断
        const heartbeat = setInterval(() => {
            if (res.writableEnded || res.destroyed) return;
            res.write(': ping\n\n');
        }, 15000);

        let unsubscribe = () => { };

        const cleanup = () => {
            clearInterval(heartbeat);
            unsubscribe();
        };

        unsubscribe = helpers.download.subscribeTaskEvents(task_id, (type, payload) => {
            send(type, payload);
            // 任务删除事件发完即可断开，避免连接一直挂着
            if (type === 'deleted') {
                cleanup();
                res.end();
            }
        });

        req.on('close', cleanup);
        req.on('error', cleanup);

        // 首帧：立刻推一份当前状态，前端不必再单独请求一次接口
        if (task_id) {
            helpers.download.getTask(task_id).buildPageStatusData()
                .then((data) => send('status', data))
                .catch((e) => console.error('[sse] first frame error:', e.message));
        } else {
            send('tasks', helpers.download.getAllTasks().data);
        }

        // 响应已由本方法接管
        return undefined;
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
