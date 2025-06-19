// config/plugin/english-language/main.js
class EnglishLanguagePlugin extends LanguagePlugin {
    async getAllData() {
        return {
            "home.library": "Library",
            "home.tag": "Tag",
            "home.download": "Download",
            "home.download.task": "Task",
            "home.download.download": "Download",

            "home.manage": "Manage",
            "home.manage.user": "User",
            "home.manage.plugin": "Plugin",

            "home.setting": "Setting",

            "home.setting.lang": "Language",
            "home.setting.logout": "Logout",
        };
    }
}

module.exports = {
    Plugin: EnglishLanguagePlugin
};