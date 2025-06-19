// config/plugin/english-language/main.js
class ChineseLanguagePlugin extends LanguagePlugin {
    async getAllData() {
        return {
            "home.library": "库",
            "home.tag": "标签",
            "home.download": "下载",
            "home.download.task": "任务",
            "home.download.download": "下载",

            "home.manage": "管理",
            "home.manage.user": "用户",
            "home.manage.plugin": "插件",

            "home.setting": "设置",

            "home.setting.lang": "语言",
            "home.setting.logout": "退出",
        };
    }
}

//global.LanguagePlugin = ChineseLanguagePlugin;
module.exports = {
    Plugin: ChineseLanguagePlugin
};