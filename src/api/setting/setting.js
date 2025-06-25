const { iComicCtrl } = require('../../units/iComic.js');
const { UpdateSystem } = require('../../units/update.js');
const path = require('path');
const fs = require('fs');
const { version } = require('os');
const currentVersion = require('../../../package.json').version;
class setting {
    config_path = "";
    config = { version: currentVersion };
    init(config_path) {
        this.config_path = path.join(config_path, "system.json");
        if (fs.existsSync(this.config_path)) {
            this.config = JSON.parse(fs.readFileSync(this.config_path, 'utf-8'));
            this.config.version = currentVersion;
        }
    }
    sysConfig() {
        return {
            status: (this.config ? true : false),
            data: this.config
        }
    }

    saveConfig(req, res, helpers) {
        let config_name = req.body.config_name;
        let config_value = req.body.config_value;

        this.config[config_name] = config_value;

        return this.saveConfigFile();
    }

    saveConfigFile() {
        //保存配置文件
        try {
            if (this.config && this.config_path) {
                fs.writeFileSync(this.config_path, JSON.stringify(this.config), 'utf-8');
            }
        } catch (error) {
            return {
                status: false,
                msg: `server.save_failed`,
                i18n: {
                    msg: error.message
                }
            }
        }

        return {
            status: true,
            msg: "server.save_success"
        }
    }

    getCacheSize() {
        //计算根目录下
        // .backup 文件夹的大小
        // .temp 文件夹的大小
        // 先判断文件夹存在不存在
        let rootDir = path.join(__dirname, "/../../../");
        let backupSize = 0, tempSize = 0, totalSize = 0;
        let backup_path = path.join(rootDir, '.backup');
        let temp_path = path.join(rootDir, '.temp');
        let paths = [];

        // 递归计算文件夹大小的函数
        const calculateSize = (dirPath) => {
            if (!fs.existsSync(dirPath)) return 0;

            const stats = fs.statSync(dirPath);
            if (stats.isFile()) {
                // 跳过点开头的文件
                return path.basename(dirPath).startsWith('.') ? 0 : stats.size;
            }

            // 跳过node_modules和点开头的文件夹
            const dirName = path.basename(dirPath);
            if (dirName === 'node_modules' || dirName.startsWith('.')) {
                // 如果不是backup_path和temp_path文件夹，就返回0
                if (paths.includes(dirPath) === false) {
                    return 0;
                }
            }

            let total = 0;
            const items = fs.readdirSync(dirPath);

            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                try {
                    total += calculateSize(itemPath);
                } catch (error) {
                    console.error(`计算 ${itemPath} 大小出错:`, error);
                    continue;
                }
            }
            return total;
        };

        if (fs.existsSync(backup_path)) {
            paths.push(backup_path);
        }

        if (fs.existsSync(temp_path)) {
            paths.push(temp_path);
        }

        for (const path of paths) {
            if (fs.existsSync(path)) {
                try {
                    totalSize += calculateSize(path);
                } catch (error) {
                    console.log(`计算文件夹${path}大小出错:`, error);
                    totalSize += 0;
                }
            }
        }

        return {
            status: true,
            data: {
                backupSize,
                tempSize,
                size: totalSize
            }
        }
    }

    clearCache(req, res, helpers) {
        let rootDir = path.join(__dirname, "/../../../");
        let backup_path = path.join(rootDir, '.backup');
        let temp_path = path.join(rootDir, '.temp');

        try {
            //如果存在就删除
            if (fs.existsSync(backup_path)) {
                fs.rmdirSync(backup_path, { recursive: true });
            }

            if (fs.existsSync(temp_path)) {
                fs.rmdirSync(temp_path, { recursive: true });
            }

            return { status: true, msg: "server.success" };
        } catch (error) {
            return { status: false, msg: "server.error", i18n: { msg: error.message } };
        }
    }

    async getAllLang(req, res, helpers) {
        let items = helpers.plugin.getPluginsByType("language");

        let datas = await Promise.all(items.map(async (item) => {
            return {
                id: item.id,
                name: item.name,
                version: item.version,
                description: item.description,
                data: await item.getAllData()
            };
        }));

        return {
            status: true,
            data: datas
        }
    }

    /**
     * 版本比较方法（不依赖第三方库）
     * @param {string} v1 当前版本
     * @param {string} v2 最新版本
     * @returns {number} 1:需要更新 0:相同 -1:当前版本更高
     */
    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const num1 = parts1[i] || 0;
            const num2 = parts2[i] || 0;
            if (num1 > num2) return -1;
            if (num1 < num2) return 1;
        }
        return 0;
    }

    /**
     * 检查更新接口
     * @returns {
     *   status: boolean,
     *   currentVersion: string,
     *   latestVersion: string,
     *   hasUpdate: boolean,
     *   releaseNotes: string,
     *   downloadUrl: string
     * }
     */
    async checkUpdate(req, res, helpers) {
        try {
            const iComic = new iComicCtrl();
            // 获取仓库
            const repo = process.env.UPDATE_REPO;

            // 使用iComic.get请求GitHub API
            const response = await iComic.get(
                `https://api.github.com/repos/${repo}/releases/latest`,
                {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'soCoolDad/iComic',
                    'Authorization': (process.env.GITHUB_PAT ? `Bearer ${process.env.GITHUB_PAT}` : undefined)
                }
            );

            const latestRelease = JSON.parse(response.body);
            const latestVersion = (latestRelease?.tag_name || "0.0.0").replace(/^v/, '').trim();
            const versionComparison = this.compareVersions(currentVersion, latestVersion);

            return {
                status: true,
                data: {
                    currentVersion: currentVersion,
                    latestVersion: latestVersion,
                    hasUpdate: versionComparison === 1,
                    isCurrentHigher: versionComparison === -1,
                    releaseNotes: latestRelease.body || '暂无更新说明',
                    downloadUrl: latestRelease.assets?.[0]?.browser_download_url || latestRelease.zipball_url,
                    publishedAt: latestRelease.published_at
                }
            };

        } catch (error) {
            console.log("检查更新失败", error);

            return {
                status: false,
                msg: 'server.error',
                currentVersion,
                i18n: {
                    msg: error.message,
                    version: currentVersion
                }
            };
        }
    }

    async update(req, res, helpers) {
        try {
            const updater = new UpdateSystem();
            const result = await updater.execute();
            return result;
        } catch (error) {
            return { status: false, msg: error.message };
        }
    }

    async reboot(req, res, helpers) {
        try {
            const updater = new UpdateSystem();
            const result = await updater.reboot();
            return result;
        } catch (error) {
            return { status: false, msg: error.message };
        }
    }
}

module.exports = setting