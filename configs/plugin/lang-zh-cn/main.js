// config/plugin/english-language/main.js
class ChineseLanguagePlugin extends LanguagePlugin {
    async getAllData() {
        return {
            home: {
                title: "iComic",
            },
            download: {
                title: "下载",
                download: "下载",
                download_task: "任务"
            },
            plugin: {
                title: "插件"
            },
            setting: {
                title: "设置",
                setting: "设置",
                about_me: "关于我们",
                about_me_info: "iComic 是一款支持第三方插件的电子漫画阅读应用，可用于获取和解析漫画文件。祝您阅读愉快！",
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
                clear_cache: "清理缓存"
            }
        };
    }
}

//global.LanguagePlugin = ChineseLanguagePlugin;
module.exports = {
    Plugin: ChineseLanguagePlugin
};