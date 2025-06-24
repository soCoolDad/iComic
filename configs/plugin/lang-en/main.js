class EnglishLanguagePlugin extends LanguagePlugin {
    async getAllData() {
        return {
            home: {
                title: "iComic",
            },
            library: {
                title: "Library",
                empty: "Scan library first",
                scan: "Scan",
                continue: "Continue",
                not_parsed: "Not parsed",
                all_files: "All files",
                not_parsed_file: "File not parsed",
                select_parse_plugin: "Select parser",
                parse: "Parse",
                select_chapter: "Select chapter",
                start_read: "Start reading",
                status_not_parsed: "Not parsed",
                status_parsing: "Parsing",
                status_parsed: "Parsed",
                status_parse_failed: "Failed"
            },
            download: {
                title: "Search",
                search: "Search",
                searching: "Searching {query}",
                no_result: "No results for {query}",
                standby: "Browse comics",
                cover: "Cover",
                detail: "Details",
                col_title: "Title",
                col_description: "Description",
                add_to_col: "Action",
                add_to_task: "Add"
            },
            reader: {
                loading_title: "Loading",
                loading_description: "Loading page...",
                loading_error_title: "Error",
                loading_error_description: "Failed: {error}"
            },
            download_task: {
                title: "Tasks",
                col_name: "Name",
                col_progress: "Progress",
                col_info: "Info",
                col_action: "Action",
                col_status: "Status",
                col_status_wait: "Pending",
                col_status_downloading: "Downloading",
                col_status_finish: "Completed",
                col_status_error: "Failed",
                col_status_pause: "Paused",
                col_status_delete: "Deleted",
                btn_action_start: "Start",
                btn_action_pause: "Pause",
                btn_action_delete: "Delete",
                errbox_title: "Download error",
                errbox_btn_colse: "Close"
            },
            plugin: {
                title: "Plugins",
                plugin: "Plugin",
                manage: "Manage",
                type_language: "Language",
                type_search: "Search",
                type_parse: "Parser",
                install_success: "Installed",
                need_install: "Requires install",
                install_dependency: "Install"
            },
            setting: {
                title: "Settings",
                setting: "Settings",
                about_me: "About",
                about_me_info: "iComic is a manga reader app. Enjoy reading!",
                github: "GitHub",
                GitHub_PAT: "GitHub PAT",
                GitHub_PAT_Info: "Required for GitHub API rate limit (60 requests/hour)",
                save: "Save",
                language: "Language",
                version: "Version",
                has_new_version: "New:{version}",
                check_new: "Check update",
                update: "Update",
                cache: "Cache",
                clear_cache: "Clear cache"
            },
            update: {
                title: "Update",
                new_version: "New version",
                update_info: "Release notes",
                warning: "Backup your data!",
                warning_tip: "Unpersisted data will be lost after update",
                warning_tip2: "Service may restart during update",
                releaseNotes: "Changelog",
                update: "Update"
            }
        };
    }
}

//global.Plugin = EnglishLanguagePlugin;
module.exports = {
    Plugin: EnglishLanguagePlugin
};