const fs = require('fs').promises;
const vm = require('vm');
const path = require('path');
const { Module } = require('module');
const chokidar = require('chokidar'); // 用于文件监听
const { BasePlugin, LanguagePlugin, SearchPlugin, FileParserPlugin } = require("../../units/basePlugin.js");
const { iComicCtrl } = require("../../units/iComic.js");

// 插件「加载期」同步代码的执行上限。
// Node 是单线程，插件里一个 while(true) 会让 loadPlugin 永不返回、连 express 一起停摆，
// 因此在沙箱执行处统一限时。
const PLUGIN_LOAD_TIMEOUT_MS = 5000;
// 配置非法 / 未导出 Plugin 类 —— 都属于「重试也没用」的永久性错误
const PLUGIN_CONFIG_INVALID = 'PLUGIN_CONFIG_INVALID';
const PLUGIN_CLASS_MISSING = 'PLUGIN_CLASS_MISSING';

class PluginManager {
    constructor() {
        this.plugins = new Map(); // 存储加载的插件
        this.pluginDirs = new Set(); // 存储插件目录
        this.sandboxes = new Map(); // 存储每个插件的沙箱环境
        this.watcher = null; // 文件监听器
    }

    // 初始化插件管理器
    async init(pluginPath) {
        this.pluginPath = pluginPath;

        //console.log(pluginPath);

        // 初始化文件监听
        // 忽略.文件
        // 忽略node_modules目录
        // 忽略package-lock.json —— npm install 会生成它，不忽略会导致插件自我重载
        this.watcher = chokidar.watch(pluginPath, {
            ignored: /(^|[\/\\])(\..+|node_modules|package-lock\.json)/,
            ignoreInitial: true,
            persistent: true,
            depth: 1
        });

        // 监听插件目录变化
        this.watcher
            .on('addDir', async dir => {
                const ready = await this.isPluginReady(dir);
                if (ready) {
                    // 目录被重建时先卸载，否则旧实例不会被 destroy，成为幽灵实例
                    await this.unloadPlugin(dir);
                    await this.loadPlugin(dir);
                }
            })
            .on('unlinkDir', dir => this.unloadPlugin(dir))
            .on('change', file => this.reloadPlugin(file));

        // 加载现有插件
        await this.loadAllPlugins();
    }

    async isPluginReady(dir) {
        try {
            await fs.access(path.join(dir, 'config.json'));
            await fs.access(path.join(dir, 'main.js'));
            return true;
        } catch {
            return false;
        }
    }

    // 加载所有插件
    async loadAllPlugins() {
        const dirs = await fs.readdir(this.pluginPath);
        for (const dir of dirs) {
            const fullPath = path.join(this.pluginPath, dir);
            const stat = await fs.stat(fullPath);
            // 只尝试真正的插件目录：缺 config.json / main.js 的目录直接跳过，
            // 否则每次启动都要为它们白跑一遍「读取失败」
            if (stat.isDirectory() && await this.isPluginReady(fullPath)) {
                await this.loadPlugin(fullPath);
            }
        }
    }

    // 校验 config.json 的必填字段
    // 此前零校验：缺 id 会以 "undefined" 为 key 注册（插件隐身）、两个都缺会互相覆盖、
    // parser 缺 support_file 会让 parseAllBySupportFile 整体抛 TypeError
    validatePluginConfig(config, pluginDir) {
        const fail = (reason) => {
            const err = new Error(`Invalid plugin config at ${pluginDir}: ${reason}`);
            err.code = PLUGIN_CONFIG_INVALID;
            throw err;
        };

        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            fail('config.json must be a JSON object');
        }
        if (typeof config.id !== 'string' || config.id.trim() === '') {
            fail('"id" is required and must be a non-empty string');
        }
        if (config.type !== undefined && !['language', 'search', 'parser'].includes(config.type)) {
            fail(`"type" must be one of language/search/parser, got ${JSON.stringify(config.type)}`);
        }
        if (config.support_file !== undefined) {
            const invalid = !Array.isArray(config.support_file) ||
                config.support_file.some(s => typeof s !== 'string' || s.trim() === '');
            if (invalid) {
                fail('"support_file" must be an array of non-empty strings');
            }
        }
        // name 缺省回退到 id，避免插件内部报错信息里出现 undefined
        if (typeof config.name !== 'string' || config.name.trim() === '') {
            config.name = config.id;
        }
    }

    // 判断加载错误是否值得重试。
    // 语法错误 / 配置非法 / 未导出 Plugin / 执行超时 / 文件缺失都是永久性错误，
    // 重试只会让启动白等（实测 1 个坏插件要 3107ms）
    isRetryableLoadError(err) {
        if (!err) return false;
        if (err instanceof SyntaxError) return false;
        if (err.code === PLUGIN_CONFIG_INVALID) return false;
        if (err.code === PLUGIN_CLASS_MISSING) return false;
        if (err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return false;
        if (err.code === 'ENOENT') return false;
        return true;
    }

    // 加载单个插件
    async loadPlugin(pluginDir, retryCount = 3) {
        let config = null;
        let sandbox = null;
        try {
            // 读取插件配置
            const configPath = path.join(pluginDir, 'config.json');
            config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
            this.validatePluginConfig(config, pluginDir);

            // 创建沙箱环境
            sandbox = this.createSandbox(config.id, pluginDir);

            // 加载插件主文件
            const mainPath = path.join(pluginDir, 'main.js');
            const code = await fs.readFile(mainPath, 'utf-8');

            // 在沙箱中执行插件代码（timeout 限定同步代码，防死循环卡死主进程）
            const script = new vm.Script(code, { filename: mainPath });
            script.runInContext(sandbox, { timeout: PLUGIN_LOAD_TIMEOUT_MS });

            // 获取插件导出的类
            const PluginClass = sandbox.exports.Plugin ||
                sandbox.module.exports.Plugin ||
                sandbox.Plugin;

            if (!PluginClass) {
                const err = new Error('Plugin class not exported correctly');
                err.code = PLUGIN_CLASS_MISSING;
                throw err;
            }

            // 创建插件实例
            const plugin = new PluginClass(config.id, config.name, config, pluginDir);

            // parser 插件必须声明 support_file，否则 parseAllBySupportFile 会在
            // plug.support_file.includes(ext) 处抛 TypeError，连带整个「解析全部」失败
            if (plugin.type === 'parser' &&
                (!Array.isArray(plugin.support_file) || plugin.support_file.length === 0)) {
                const err = new Error('Parser plugin requires a non-empty "support_file" array');
                err.code = PLUGIN_CONFIG_INVALID;
                throw err;
            }

            // 初始化插件。
            // init() 也在沙箱内调用，这样 init 里的同步死循环同样能被 timeout 掐断
            // （runInContext 的 timeout 只约束「被它执行的同步代码」，宿主侧直接调用 plugin.init() 不受约束）
            sandbox.__pluginInstance = plugin;
            let initRet;
            try {
                initRet = vm.runInContext('__pluginInstance.init()', sandbox, { timeout: PLUGIN_LOAD_TIMEOUT_MS });
            } finally {
                delete sandbox.__pluginInstance;
            }
            await initRet;

            // 存储插件（成功后才登记 sandbox，避免加载失败后 sandboxes 残留幽灵条目）
            this.plugins.set(config.id, plugin);
            this.sandboxes.set(config.id, sandbox);
            this.pluginDirs.add(pluginDir);

            console.log(`Plugin loaded: ${plugin.id} on ${plugin.path}`);
        } catch (err) {
            if (retryCount > 0 && this.isRetryableLoadError(err)) {
                console.log(`Retrying load plugin (${4 - retryCount}/3) for ${pluginDir}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.loadPlugin(pluginDir, retryCount - 1);
            }
            console.error(`Failed to load plugin from ${pluginDir}:`, err);
        }
    }

    // 创建沙箱环境
    createSandbox(pluginId, pluginDir) {
        //console.log(pluginId,pluginDir);
        const sandbox = {
            require: this.createScopedRequire(pluginDir),
            console,
            process: {
                env: { ...process.env },
                cwd: () => pluginDir,
                nextTick: process.nextTick
            },
            module: new Module(pluginDir),
            exports: {},
            __dirname: pluginDir,
            __filename: path.join(pluginDir, 'main.js'),
            Buffer,
            setImmediate,
            clearImmediate,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
            path,
            iComic: new iComicCtrl(),
            URL,
            URLSearchParams,
            TextEncoder,
            TextDecoder,
            // 添加你的插件基类
            BasePlugin,
            LanguagePlugin,
            SearchPlugin,
            FileParserPlugin
        };

        return vm.createContext(sandbox);
    }

    // 为插件创建作用域的 require
    createScopedRequire(pluginDir) {
        const originalRequire = require;
        const builtinModules = require('module').builtinModules;
        return function scopedRequire(mod) {
            // 1) 优先解析到插件自己的 node_modules（插件自带依赖）
            try {
                return originalRequire(
                    require.resolve(mod, { paths: [pluginDir, path.join(pluginDir, 'node_modules')] })
                );
            } catch (e) { /* 继续回退 */ }

            // 2) 回退到主程序作用域（/app/node_modules）
            //    容器里插件目录是独立挂载的 /configs，上行查找链只到 /configs/node_modules、/node_modules，
            //    永远到不了 /app/node_modules；而 ictz/cbz 等解析插件依赖主程序已安装的 node-stream-zip，
            //    因此必须保留这一级回退（v0.0.47 收紧为“仅内置模块”后这些插件全部解析失败）
            try {
                return originalRequire(mod);
            } catch (e) { /* 继续回退 */ }

            // 3) 兜底 Node.js 内置模块（含 node: 前缀与 fs/promises 这类子路径）
            const modBase = mod.startsWith('node:') ? mod.slice(5) : mod.split('/')[0];
            if (builtinModules.includes(modBase) || mod.startsWith('node:')) {
                return originalRequire(mod);
            }

            throw new Error(`Cannot find module '${mod}' in plugin scope`);
        };
    }

    // 重新加载插件
    async reloadPlugin(changedFile) {
        const pluginDir = path.dirname(changedFile);
        if (this.pluginDirs.has(pluginDir)) {
            // 防止重复卸载/加载（多个文件同时变化时只处理一次）
            if (this._reloading && this._reloading.has(pluginDir)) return;
            this._reloading = this._reloading || new Set();
            this._reloading.add(pluginDir);
            try {
                await this.unloadPlugin(pluginDir);
                await this.loadPlugin(pluginDir);
            } finally {
                this._reloading.delete(pluginDir);
            }
        }
    }

    // 卸载插件
    // 注意：loadPlugin 是以 config.id 注册实例的（plugins / sandboxes 的 key 是 id），
    // 而本方法入参是插件目录，目录名与 id 不一定相同（如目录 sb-test / id sb），
    // 因此必须按 path 反查实例；沿用 basename 查表会在两者不同时静默卸载失败
    // （不执行 destroy、不清 plugins / pluginDirs / sandboxes）
    async unloadPlugin(pluginDir) {
        const target = path.resolve(pluginDir);
        let plugin = null;
        for (const item of this.plugins.values()) {
            if (item.path && path.resolve(item.path) === target) {
                plugin = item;
                break;
            }
        }

        if (!plugin) {
            return;
        }

        const pluginId = plugin.id;

        try {
            await plugin.destroy();
        } catch (err) {
            console.error(`Error destroying plugin ${pluginId}:`, err);
        }

        this.plugins.delete(pluginId);
        this.pluginDirs.delete(plugin.path);
        this.sandboxes.delete(pluginId);

        console.log(`Plugin unloaded: ${pluginId}`);
    }

    // 安装插件依赖
    async installPluginDependencies(pluginId) {
        try {
            const plugin = this.plugins.get(pluginId);

            // 插件不存在（未加载完成 / 已卸载）时必须返回失败：
            // 此前直接调 plugin.installDependencies() 会抛 TypeError 被 catch 吞掉，
            // 再由 catch 返回 status: true，前端判断不出失败
            if (!plugin) {
                return { status: false, msg: "server.no_plugin" };
            }

            await plugin.installDependencies();

            return { status: true, msg: "server.install_success" };
        } catch (error) {
            return {
                status: false,
                msg: "server.install_error",
                i18n: {
                    msg: error.message
                }
            }
        }
    }

    // 安装所有插件依赖
    async installAllPluginDependencies() {
        try {
            let success_count = 0;
            let fail_count = 0;

            for (let pluginId of this.plugins.keys()) {
                let ret = await this.installPluginDependencies(pluginId);
                if (ret.status) {
                    success_count++;
                } else {
                    fail_count++;
                }
            }

            // 有失败就不能整体报成功（此前 fail_count 恒为 0，因为靠恒真的 ret.status 计数）
            return {
                status: fail_count === 0,
                msg: fail_count === 0 ? `server.install_success_multi` : `server.install_error_multi`,
                i18n: {
                    install_count: success_count,
                    error_count: fail_count,
                    msg: `${fail_count}/${success_count + fail_count}`
                }
            };
        } catch (error) {
            return {
                status: false,
                msg: "server.install_error_multi",
                i18n: {
                    msg: error.message
                }
            }
        }
    }

    // 获取插件
    getPlugin(pluginId) {
        return this.plugins.get(pluginId);
    }

    // 获取所有插件
    getAllPlugins() {
        return Array.from(this.plugins.values());
    }

    // 按类型获取插件
    getPluginsByType(type) {
        return this.getAllPlugins().filter(p => p.type === type);
    }

    // 销毁插件管理器
    async destroy() {
        if (this.watcher) {
            await this.watcher.close();
        }

        for (const plugin of this.plugins.values()) {
            try {
                await plugin.destroy();
            } catch (err) {
                console.error('Error destroying plugin:', err);
            }
        }

        this.plugins.clear();
        this.pluginDirs.clear();
        this.sandboxes.clear();
    }
}

module.exports = PluginManager
