class ChineseLanguagePlugin extends LanguagePlugin {
    async getAllData() {
        return {
            home: {
                title: "iComic",
            },
            library: {
                title: "库",
                empty: "请先扫描一下库吧",
                scan: "扫描",
                continue: "继续阅读",
                not_parsed: "未解析",
                all_files: "所有文件",
                not_parsed_file: "该文件还未解析",
                select_parse_plugin: "请选择解析插件进行解析",
                parse: "解析",
                select_chapter: "选择章节",
                select_parse_plugin: "请选择解析插件进行阅读",
                start_read: "开始阅读",
                status_not_parsed: "未解析",
                status_parsing: "正在解析",
                status_parsed: "解析完成",
                status_parse_failed: "解析失败",
            },
            download: {
                title: "搜索",
                search: "搜索",
                searching: "{query}搜索中",
                no_result: "{query}未找到结果",
                standby: "总有你想看的",
                cover: "封面",
                detail: "详情",
                col_title: "标题",
                col_description: "简介",
                add_to_col: "操作",
                add_to_task: "添加",
            },
            reader: {
                loading_title: "加载中",
                loading_description: "页面加载中，请稍稍等待！",
                loading_error_title: "加载失败",
                loading_error_description: "页面加载失败：{error}",
            },
            download_task: {
                title: "任务",
                col_name: "名称",
                col_progress: "进度",
                col_info: "信息",
                col_action: "操作",
                col_status: "状态",
                col_status_wait: "等待下载",
                col_status_downloading: "正在下载",
                col_status_finish: "下载完成",
                col_status_error: "下载失败",
                col_status_pause: "暂停下载",
                col_status_delete: "已删除",
                btn_action_start: "开始",
                btn_action_pause: "暂停",
                btn_action_delete: "删除",
                errbox_title: "下载中出现的错误",
                errbox_btn_colse: "关闭",
            },
            plugin: {
                title: "插件",
                plugin: "插件",
                manage: "管理",
                type_language: "语言包",
                type_search: "搜索库",
                type_parse: "文件解析",
                install_success: "依赖安装完成",
                need_install: "需安装依赖",
                install_dependency: "安装依赖",
            },
            setting: {
                title: "设置",
                setting: "设置",
                about_me: "关于我们",
                about_me_info: "iComic 是一款电子漫画阅读应用。祝您阅读愉快！",
                github: "访问项目",
                GitHub_PAT: "GitHub PAT",
                GitHub_PAT_Info: "因为更新需要访问GitHub Api, Github Personal Access token 可以突破GitHub Api每小时60次的限制",
                save: "保存",
                language: "语言",
                version: "版本",
                has_new_version: "新:{version}",
                check_new: "检查更新",
                update: "更新",
                cache: "缓存",
                clear_cache: "清理缓存",
                find_new_version: "发现新版本:[{version}]",
                current_version_is_higher: "当前版本:[{version}]已是最新",
                current_version_is_new: "版本[{version}]已是最新版本",
                device_title: "请求设备",
                device_desc: "iComic 在发起请求时所携带的请求头",
            },
            update: {
                title: "更新",
                new_version: "新版本",
                update_info: "更新说明",
                warning: "请备份好数据！请备份好数据！请备份好数据！",
                warning_tip: "如果您的数据没有持久化保存，更新后将会丢失(插件，库，数据)",
                warning_tip2: "更新过程中可能会关闭服务，具体进度请在Docker里查看对应的容器日志",
                releaseNotes: "更新日志",
                update: "更新",
                updating: "更新中",
                cancel: "取消",
                data_loss_warning: "数据丢失警告",
                data_loss_warning2: "确定更新吗?如果数据没有备份或持久化，更新后将会丢失(插件，库，数据)",

                no_update: "没有更新项",
                has_update: "有{count}个更新",
            },
            server: {
                success: "处理成功",
                error: "处理失败:{msg}",
                param_error: "参数错误。{msg}",
                save_success: "保存成功",
                save_failed: "保存失败：{msg}",

                add_success: "添加成功",

                no_file: "文件不存在",
                no_file_select: "未选择文件",
                no_block: "文件不存在",
                no_config: "配置不存在",
                no_plugin: "插件不存在",
                no_plugin_select: "未选择插件",
                no_library: "库不存在",

                plugin_cant_support_search: "该插件不提供搜索",


                file_no_parse: "文件未解析",

                no_task: "任务不存在",
                task_running: "任务已在运行中",
                task_begin: "任务开始",
                task_has: "任务已存在",
                task_pause: "任务已暂停",
                task_delete: "任务已删除",

                scan_complete: "扫描完成:新增{added},删除{deleted}",
                scan_error: "扫描失败：{msg}",

                parse_begin: "开始解析",
                parse_complete: "解析完成",
                parse_begin_multi: "开始解析{parse_count}个文件,共{file_count}个文件",

                install_success: "安装依赖成功",
                install_error: "安装依赖失败：{msg}",

                install_success_multi: "安装依赖成功：{install_count}个插件，失败：{error_count}个",
                install_error_multi: "批量安装依赖失败：{msg}"
            }
        };
    }
}

//global.Plugin = ChineseLanguagePlugin;
module.exports = {
    Plugin: ChineseLanguagePlugin
};