const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { iComicCtrl } = require('./iComic.js');
const crypto = require('crypto');

const findRoot = () => {
    let dir = __dirname;
    while (dir !== '/') {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    return process.cwd();
};

// 配置项
const CONFIG = {
    rootDir: findRoot(),
    repo: process.env.UPDATE_REPO || "soCoolDad/iComic", // GitHub仓库
    currentVersion: require('../../package.json').version,
    backupDir: path.join(findRoot(), '.backup'),
    tempDir: path.join(findRoot(), '.temp', Date.now().toString()),
    maxBackups: 2
};

// 工具函数：流式执行命令
function runCommand(cmd, args, cwd = process.cwd()) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
        // 命令不存在等 spawn 错误必须监听，否则会成为未捕获异常导致整个进程退出
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} ${args.join(' ')} failed, code: ${code}`));
        });
    });
}

// 工具函数：流式sha256
function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// 版本比较方法（不依赖第三方库）
// @param {string} v1 当前版本
// @param {string} v2 最新版本
// @returns {number} 1:需要更新 0:相同 -1:当前版本更高
function compareVersions(v1, v2) {
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

class UpdateSystem {
    /**
     * 版本比较方法（不依赖第三方库）
     * @param {string} v1 当前版本
     * @param {string} v2 最新版本
     * @returns {number} 1:需要更新 0:相同 -1:当前版本更高
     */
    compareVersions(v1, v2) {
        return compareVersions(v1, v2);
    }
    // 检查GitHub releases
    async checkUpdate() {
        try {
            const iComic = new iComicCtrl();
            // 使用iComic.get请求GitHub API
            const response = await iComic.get(
                `https://api.github.com/repos/${CONFIG.repo}/releases/latest`,
                {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'soCoolDad/iComic',
                    'Authorization': (process.env.GITHUB_PAT ? `Bearer ${process.env.GITHUB_PAT}` : undefined)
                }
            );

            const res = JSON.parse(response.body);

            //console.log(res);

            return this.compareVersions(CONFIG.currentVersion, res.tag_name) == 1 ? res : null;
        } catch (error) {
            throw new Error(`检查更新失败: ${error.message}`);
        }
    }

    // 创建备份（轮转式）
    async createBackup() {
        await fs.ensureDir(CONFIG.backupDir);

        // 清理旧备份（按修改时间排序，删除最旧的）
        const backups = await fs.readdir(CONFIG.backupDir);
        if (backups.length >= CONFIG.maxBackups) {
            const backupInfos = await Promise.all(backups.map(async name => {
                const fullPath = path.join(CONFIG.backupDir, name);
                const stat = await fs.stat(fullPath);
                return { name, fullPath, mtime: stat.mtime };
            }));
            backupInfos.sort((a, b) => a.mtime - b.mtime);
            await fs.remove(backupInfos[0].fullPath);
        }

        const backupName = `backup_${new Date().toISOString()}.zip`;
        const backupPath = path.join(CONFIG.backupDir, backupName);

        // 用 spawn 替代 execSync
        await runCommand('zip', [
            '-r', backupPath, '.',
            '-x', 'node_modules/*', 'web/node_modules/*', '.backup/*', '.temp/*'
        ], CONFIG.rootDir);

        return backupPath;
    }

    // 安全下载更新
    async downloadUpdate(release) {
        await fs.ensureDir(CONFIG.tempDir);
        const asset = release.zipball_url;

        if (!asset) throw new Error('未找到ZIP格式的Release资源');
        console.log('update', `下载更新包: ${asset}`);

        const tempFile = path.join(CONFIG.tempDir, 'update.zip');
        await runCommand('curl', ['-L', asset, '-o', tempFile], CONFIG.tempDir);

        // 校验SHA256（可选）
        if (release.body.includes('SHA256')) {
            const match = release.body.match(/SHA256:\s*(\w+)/);
            if (match && match[1]) {
                const expectedHash = match[1];
                const actualHash = await sha256File(tempFile);

                if (expectedHash !== actualHash) {
                    throw new Error('文件校验失败');
                }
            }
        }

        return tempFile;
    }

    // 原子化替换文件
    async applyUpdate(zipPath) {
        try {
            console.log('update', '解压更新包...');

            let temp_files_dir = path.join(CONFIG.tempDir);

            await runCommand('unzip', ['-o', zipPath, '-d', temp_files_dir], CONFIG.tempDir);

            //查找new目录下真正的项目文件目录
            const newDir = temp_files_dir;
            const entries = await fs.readdir(newDir);
            let sourceDir = newDir;

            // GitHub zipball会创建一个子目录如"iComic-1.0.0"
            for (const entry of entries) {
                const subDir = path.join(newDir, entry);
                if (fs.existsSync(path.join(subDir, 'package.json'))) {
                    sourceDir = subDir;
                    break;
                }
            }

            if (!sourceDir || !fs.existsSync(path.join(sourceDir, 'package.json'))) {
                throw new Error('未找到有效的项目目录');
            }

            // 使用rsync原子替换
            // 只替换必要的文件
            // 同步单个文件 (不使用 --delete)
            await runCommand('rsync', ['-a', `${sourceDir}/package.json`, `${CONFIG.rootDir}/`], CONFIG.rootDir);
            await runCommand('rsync', ['-a', `${sourceDir}/web/package.json`, `${CONFIG.rootDir}/web/`], CONFIG.rootDir);

            // 同步目录 (使用 --delete)
            await runCommand('rsync', ['-a', '--delete', `${sourceDir}/src/`, `${CONFIG.rootDir}/src/`], CONFIG.rootDir);

            // configs 目录：只同步 system.json 与内置插件，保护用户数据（db/library/用户插件）
            await runCommand('rsync', ['-a', `${sourceDir}/configs/system.json`, `${CONFIG.rootDir}/configs/system.json`], CONFIG.rootDir);
            for (const plugin of ['cbz_file_parse', 'ictz_file_parse', 'lang-en', 'lang-zh-cn']) {
                await runCommand('rsync', ['-a', '--delete', `${sourceDir}/configs/plugin/${plugin}/`, `${CONFIG.rootDir}/configs/plugin/${plugin}/`], CONFIG.rootDir);
            }

            // 特殊处理 web 目录 (保留 node_modules)
            await runCommand('rsync', [
                '-a',
                '--delete',
                '--exclude=node_modules/',
                `${sourceDir}/web/`,
                `${CONFIG.rootDir}/web/`
            ], CONFIG.rootDir);


            console.log('update', '安装插件...');
            let source_configs_path = path.join(CONFIG.rootDir, "configs");
            let target_configs_path = process.env.CONFIGS_PATH || path.join(CONFIG.rootDir, "configs");

            //如果不一致就复制到目标文件夹
            if (source_configs_path != target_configs_path) {
                await fs.copy(source_configs_path, target_configs_path);
            }

            console.log('update', '安装新依赖...');
            await runCommand('npm', ['install', '--no-audit', '--no-fund'], CONFIG.rootDir);
            await runCommand('npm', ['install', '--no-audit', '--no-fund'], path.join(CONFIG.rootDir, 'web'));

            console.log('update', '构建新版本...');
            await runCommand('npm', ['run', 'build', '--silent'], path.join(CONFIG.rootDir, 'web'));
        } catch (error) {
            throw new Error(`应用更新失败: ${error.message}`);
        }
    }

    // 回滚机制
    async rollback(backupPath) {
        console.log('update', '正在回滚...');

        await runCommand('unzip', ['-o', backupPath, '-d', CONFIG.rootDir], CONFIG.rootDir);

        console.log('update', '回滚完成，请重启应用');
    }

    async reboot() {
        setTimeout(() => {
            // 改为使用PM2重启
            try {
                const child = spawn('pm2', ['reload', 'all', '--update-env'], { stdio: 'inherit' });
                // 非 PM2 环境（本机直接 node 启动）spawn 会报 ENOENT：
                // 提示手动重启并正常退出，避免未捕获异常
                child.on('error', () => {
                    console.log('update', '非 PM2 环境，更新完成，请手动重启应用加载新版本');
                    process.exit(0);
                });
                child.on('close', () => {
                    process.exit(0);  // 确保进程退出
                });
            } catch (e) {
                console.error('PM2重启失败:', e.message);
                process.exit(1);
            }
        }, 1000);

        return { status: true, msg: '即将重启...' };
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

            console.log('update', '创建备份...');
            backup = await this.createBackup();

            console.log('update', '下载更新...');
            const updateFile = await this.downloadUpdate(release);

            console.log('update', '应用更新...');
            await this.applyUpdate(updateFile);

            console.log('update', '更新成功！即将重启...');

            return { status: true, msg: '更新成功！即将重启...' };
        } catch (error) {
            console.error('update', error.message);

            if (backup) {
                await this.rollback(backup);
            } else {
                console.error('update', '备份不存在，无法回滚');
            }

            return { status: false, msg: error.message };
        } finally {
            await this.reboot();
        }
    }
}

module.exports = { UpdateSystem, compareVersions };