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
    // 运行时真正生效的配置目录（Docker 下是挂载卷 /configs），未设置时与项目内 configs 相同
    configDir: process.env.CONFIG_DIR || path.join(findRoot(), 'configs'),
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

// 内置插件：随版本一起发布，但用户可能自己修过，覆盖前需要判定「新的替旧的」
const BUILTIN_PLUGINS = ['cbz_file_parse', 'ictz_file_parse', 'lang-en', 'lang-zh-cn'];

// 工具函数：读取插件目录下 config.json 的 version（读不到返回 null）
function readPluginVersion(dir) {
    try {
        const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf-8'));
        return typeof config.version === 'string' ? config.version.trim() : null;
    } catch (e) {
        return null;
    }
}

// 工具函数：递归列出目录下所有文件的相对路径
async function listFiles(dir, base = dir) {
    const result = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...await listFiles(fullPath, base));
        } else if (entry.isFile()) {
            result.push(path.relative(base, fullPath));
        }
    }

    return result;
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

            // 内置插件要同步到两个地方：
            //   1) 项目内 configs —— 镜像里的模板，首次初始化时 index.js 会用它铺生效目录
            //   2) 生效的配置目录 CONFIG_DIR（Docker 下是挂载卷 /configs）—— 运行时真正加载插件的位置
            // 原代码这里读的是 process.env.CONFIGS_PATH（全仓只有这一处用，恒为空），
            // 导致生效目录从来没被更新过：容器部署下内置插件更新等于没生效。
            const builtinTargets = [path.join(CONFIG.rootDir, 'configs')];
            if (path.resolve(CONFIG.configDir) !== path.resolve(path.join(CONFIG.rootDir, 'configs'))) {
                builtinTargets.push(CONFIG.configDir);
            }
            console.log('update', '内置插件同步目标: ' + builtinTargets.join(' , '));

            for (const target of builtinTargets) {
                for (const plugin of BUILTIN_PLUGINS) {
                    await this.syncBuiltinPlugin(plugin, sourceDir, target);
                }
                // system.json 只补缺，不覆盖用户已有设置
                await this.mergeSystemJson(sourceDir, target);
            }

            // 特殊处理 web 目录 (保留 node_modules)
            await runCommand('rsync', [
                '-a',
                '--delete',
                '--exclude=node_modules/',
                `${sourceDir}/web/`,
                `${CONFIG.rootDir}/web/`
            ], CONFIG.rootDir);


            console.log('update', '安装新依赖...');
            await runCommand('npm', ['install', '--no-audit', '--no-fund'], CONFIG.rootDir);
            await runCommand('npm', ['install', '--no-audit', '--no-fund'], path.join(CONFIG.rootDir, 'web'));

            console.log('update', '构建新版本...');
            await runCommand('npm', ['run', 'build', '--silent'], path.join(CONFIG.rootDir, 'web'));
        } catch (error) {
            throw new Error(`应用更新失败: ${error.message}`);
        }
    }

    /**
     * 同步单个内置插件到指定配置目录：按「谁的版本新」判定覆盖，而不是无脑覆盖
     * - 发布包版本更高：整体覆盖（保留本地在该插件目录里装的 node_modules）
     * - 版本相同 / 版本号缺失：逐文件比对 sha256，只替换有差异或本地缺失的文件，不删本地独有文件
     * - 本地版本更高：跳过覆盖，保留本地，只写日志
     * 注意：不能用文件修改时间判定——GitHub zipball 里所有条目的时间都是「打包那一刻」，
     * 必然比本地任何文件都新，按时间比等于还是无条件覆盖。
     * @param {string} plugin 插件目录名
     * @param {string} sourceDir 发布包解压出来的项目根
     * @param {string} dstConfigDir 目标配置目录（项目内 configs 或生效的 CONFIG_DIR）
     */
    async syncBuiltinPlugin(plugin, sourceDir, dstConfigDir = path.join(CONFIG.rootDir, 'configs')) {
        const srcDir = path.join(sourceDir, 'configs/plugin', plugin);
        const dstDir = path.join(dstConfigDir, 'plugin', plugin);

        if (!fs.existsSync(srcDir)) {
            console.log('update', '[内置插件] ' + plugin + '：发布包中没有该插件，跳过');
            return;
        }

        // 本地没有 → 直接安装发布包版本
        if (!fs.existsSync(dstDir)) {
            await runCommand('rsync', ['-a', srcDir + '/', dstDir + '/'], CONFIG.rootDir);
            console.log('update', '[内置插件] ' + plugin + '：本地不存在，已安装发布包版本');
            return;
        }

        const srcVersion = readPluginVersion(srcDir);
        const dstVersion = readPluginVersion(dstDir);
        const versionText = '发布包 ' + (srcVersion || '未知') + ' / 本地 ' + (dstVersion || '未知');
        // compared: 1 发布包更新、0 相同、-1 本地更新、null 版本号缺失
        const compared = (srcVersion && dstVersion) ? compareVersions(dstVersion, srcVersion) : null;

        if (compared === -1) {
            console.log('update', '[内置插件] ' + plugin + '：本地版本更高（' + versionText + '），跳过覆盖，保留本地');
            return;
        }

        if (compared === 1) {
            // 排除 node_modules：用户在内置插件目录里装过的依赖不跟着删
            await runCommand('rsync', ['-a', '--delete', '--exclude=node_modules/', srcDir + '/', dstDir + '/'], CONFIG.rootDir);
            console.log('update', '[内置插件] ' + plugin + '：发布包版本更高（' + versionText + '），已整体覆盖');
            return;
        }

        // 版本相同（或版本号缺失无法比较）：逐文件比对内容，只替换有差异的
        const srcFiles = await listFiles(srcDir);
        let replaced = 0;
        let kept = 0;

        for (const rel of srcFiles) {
            const srcFile = path.join(srcDir, rel);
            const dstFile = path.join(dstDir, rel);

            if (fs.existsSync(dstFile)) {
                const [srcHash, dstHash] = await Promise.all([sha256File(srcFile), sha256File(dstFile)]);
                if (srcHash === dstHash) {
                    kept++;
                    continue;
                }
            }

            await fs.copy(srcFile, dstFile);
            replaced++;
        }

        console.log('update', '[内置插件] ' + plugin + '：' + (compared === 0 ? '版本相同' : '版本号缺失') +
            '（' + versionText + '），比对 ' + srcFiles.length + ' 个文件，替换 ' + replaced + ' 个，内容一致保留 ' + kept +
            ' 个（不删除本地独有文件）');
    }

    /**
     * 合并 system.json：只补缺，不覆盖已有值
     * 生效目录（CONFIG_DIR，Docker 下是挂载卷 /configs）里的 system.json 存着用户的
     * GITHUB_PAT / UPDATE_REPO / LANGUAGE / 代理等设置，直接覆盖会清掉这些设置
     * （进而导致后续检查更新失效），所以只把发布包里「本地没有的键」补进去。
     * 写入格式与 setting.js 的 saveConfigFile 保持一致（JSON.stringify(..., null, 4)）。
     */
    async mergeSystemJson(sourceDir, dstConfigDir) {
        const srcFile = path.join(sourceDir, 'configs/system.json');
        const dstFile = path.join(dstConfigDir, 'system.json');

        // 同一个文件（项目内那份已由 rsync 同步过），或目标还不存在（交给首次初始化去铺）
        if (path.resolve(srcFile) === path.resolve(dstFile) || !fs.existsSync(dstFile)) return;

        let srcConfig, dstConfig;
        try {
            srcConfig = JSON.parse(fs.readFileSync(srcFile, 'utf-8'));
            dstConfig = JSON.parse(fs.readFileSync(dstFile, 'utf-8'));
        } catch (error) {
            console.log('update', 'system.json 读取或解析失败，跳过补缺: ' + error.message);
            return;
        }

        const added = [];
        for (const key of Object.keys(srcConfig)) {
            if (dstConfig[key] === undefined) {
                dstConfig[key] = srcConfig[key];
                added.push(key);
            }
        }

        if (added.length === 0) {
            console.log('update', 'system.json：无新增键，保留现有配置');
            return;
        }

        await fs.writeFile(dstFile, JSON.stringify(dstConfig, null, 4), 'utf-8');
        console.log('update', 'system.json：补入新增键 ' + added.join('/') + '，已有配置保持不变');
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