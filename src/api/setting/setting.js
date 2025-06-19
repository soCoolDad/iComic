const { iComicCtrl } = require('../../units/iComic.js');
const { UpdateSystem } = require('../../units/update.js');
const currentVersion = require('../../../package.json').version;
class setting {
    sysConfig() {
        return {
            status: true,
            data: {
                version: currentVersion,
                github_repo: process.env.UPDATE_REPO
            }
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
                    headers: {
                        'Accept': 'application/vnd.github.v3+json'
                    }
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
                msg: '检查更新失败',
                currentVersion
            };
        }
    }

    async update(req, res, helpers) {
        try {
            const updater = new UpdateSystem();
            const result = await updater.execute();
            return { status: true, data: result };
        } catch (error) {
            return { status: false, msg: error.message };
        }
    }
}

module.exports = setting