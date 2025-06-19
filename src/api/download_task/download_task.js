class download_task {
    constructor() {

    }

    getAllTasks(req, res, helpers) {
        //
        let result = helpers.download.getAllTasks();

        //console.log("result",result);

        return result;
    }
    // 开始
    begin(req, res, helpers) {
        //
        let task_id = req.body.task_id;
        let result = helpers.download.begin(task_id);

        return result;
    }

    //暂停
    pause(req, res, helpers) {
        //
        let task_id = req.body.task_id;
        let result = helpers.download.pause(task_id);

        return result;
    }

    //删除
    delete(req, res, helpers) {
        //
        let task_id = req.body.task_id;
        let result = helpers.download.delete(task_id);

        if(result?.status){
            //删除记录
            helpers.db_query.run('DELETE FROM download_task WHERE id=?', [task_id]);
        }

        return result;
    }
}

module.exports = download_task;
