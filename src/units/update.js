const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { iComicCtrl } = require('./iComic.js');
const crypto = require('crypto');

// 配置项
const CONFIG = {
    repo: process.env.UPDATE_REPO, // GitHub仓库
    currentVersion: require('../../package.json').version,
    backupDir: path.join(__dirname, '.backup'),
    tempDir: path.join(__dirname, '.temp'),
    maxBackups: 2
};

class UpdateSystem {
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
    // 检查GitHub releases
    async checkUpdate() {
        try {
            const iComic = new iComicCtrl();
            // 使用iComic.get请求GitHub API
            const response = await iComic.get(
                `https://api.github.com/repos/${repo}/releases/latest`,
                {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            const res = JSON.parse(response.body);

            return this.compareVersions(CONFIG.currentVersion, res.data.tag_name) == 1 ? res.data : null;
        } catch (error) {
            throw new Error(`检查更新失败: ${error.message}`);
        }
    }

    // 创建备份（轮转式）
    async createBackup() {
        await fs.ensureDir(CONFIG.backupDir);

        // 清理旧备份
        const backups = await fs.readdir(CONFIG.backupDir);
        if (backups.length >= CONFIG.maxBackups) {
            await fs.remove(path.join(CONFIG.backupDir, backups[0]));
        }

        const backupName = `backup_${new Date().toISOString()}.zip`;
        const backupPath = path.join(CONFIG.backupDir, backupName);

        execSync(`zip -r ${backupPath} . -x "node_modules/*" ".backup/*" ".temp/*"`);
        return backupPath;
    }

    // 安全下载更新
    async downloadUpdate(release) {
        await fs.ensureDir(CONFIG.tempDir);
        const asset = release.assets.find(a => a.name.endsWith('.zip'));

        if (!asset) throw new Error('未找到ZIP格式的Release资源');
        console.log('update', `下载更新包: ${asset.name}`);

        const tempFile = path.join(CONFIG.tempDir, 'update.zip');
        execSync(`curl -L "${asset.browser_download_url}" -o ${tempFile}`);

        // 校验SHA256（可选）
        if (release.body.includes('SHA256')) {
            const expectedHash = release.body.match(/SHA256:\s*(\w+)/)[1];
            const actualHash = crypto.createHash('sha256')
                .update(fs.readFileSync(tempFile))
                .digest('hex');

            if (expectedHash !== actualHash) {
                throw new Error('文件校验失败');
            }
        }

        return tempFile;
    }

    // 原子化替换文件
    async applyUpdate(zipPath) {
        try {
            console.log('update', '解压更新包...');
            execSync(`unzip -o ${zipPath} -d ${CONFIG.tempDir}/new`);

            // 关闭当前进程使用的文件
            process.removeAllListeners();

            // 使用rsync原子替换
            execSync(`rsync -a --delete ${CONFIG.tempDir}/new/ ${__dirname}/`);

            console.log('update', '安装插件...');
            let source_configs_path = path.join(__dirname, "configs");
            let target_configs_path = process.env.CONFIGS_PATH || path.join(__dirname, "configs");

            //如果不一致就复制到目标文件夹
            if (source_configs_path != target_configs_path) {
                fs.copySync(source_configs_path, target_configs_path);
            }

            console.log('update', '安装新依赖...');
            execSync('cnpm install', { stdio: 'inherit' });
            execSync('cd web && cnpm install && cnpm run build', { stdio: 'inherit' });
        } catch (error) {
            throw new Error(`应用更新失败: ${error.message}`);
        }
    }

    // 回滚机制
    async rollback(backupPath) {
        console.log('update', '正在回滚...');
        execSync(`unzip -o ${backupPath} -d ${__dirname}`);
        console.log('update', '回滚完成，请重启应用');
        process.exit(1);
    }

    // 主流程
    async execute() {
        let backup;
        try {
            const release = await this.checkUpdate();
            
            if (!release) {
                console.log('update', '当前已是最新版');
                return { status: false, msg: '当前已是最新版' };
            }

            console.log('update', `发现新版本: ${release.tag_name}`);
            backup = await this.createBackup();
            const updateFile = await this.downloadUpdate(release);
            await this.applyUpdate(updateFile);
            console.log('update', '更新成功！即将重启...');

            setTimeout(() => {
                require('child_process').spawn(process.argv[0], process.argv, {
                    detached: true,
                    stdio: 'inherit'
                });
                process.exit(0);
            }, 1000);

        } catch (error) {
            console.error('update', error.message);
            if (backup) {
                await this.rollback(backup);
            } else {
                console.error('update', '备份不存在，无法回滚');
            }
        }
    }
}

module.exports = { UpdateSystem };