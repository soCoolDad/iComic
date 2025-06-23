class EnglishLanguagePlugin extends LanguagePlugin {
    async getAllData() {
        return {
            home: {
                title: "iComic",  // 保持原样
            },
            download: {
                title: "Download",
                download: "Download",
                download_task: "Tasks"
            },
            plugin: {
                title: "Plugins"
            },
            setting: {
                title: "Settings",
                setting: "Settings",
                about_me: "About Us",
                about_me_info: "iComic is an e-comic reader application that supports third-party plugins, which can be used to fetch and parse comic files. Enjoy your reading!",
                github: "Visit Project",
                GitHub_PAT: "GitHub PAT",  // 专有名词保持原样
                GitHub_PAT_Info: "Since updates require access to GitHub API, GitHub Personal Access Token can break through the 60 requests per hour limit of GitHub API",
                save: "Save",
                language: "Language",
                version: "Version",
                has_new_version: "New:{version}",
                check_new: "Check for Updates",
                update: "Update",
                cache: "Cache",
                clear_cache: "Clear Cache"
            }
        };
    }
}

//global.LanguagePlugin = ChineseLanguagePlugin;
module.exports = {
    Plugin: EnglishLanguagePlugin
};