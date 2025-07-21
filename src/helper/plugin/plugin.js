const fs = require('fs').promises;
const vm = require('vm');
const path = require('path');
const { Module } = require('module');
const chokidar = require('chokidar'); // 用于文件监听
const { BasePlugin, LanguagePlugin, SearchPlugin, FileParserPlugin } = require("../../units/basePlugin.js");
const { iComicCtrl } = require("../../units/iComic.js");
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
        this.watcher = chokidar.watch(pluginPath, {
            ignored: /(^|[\/\\])(\..+|node_modules)/, // 忽略.文件和node_modules目录
            ignoreInitial: true,
            persistent: true,
            depth: 1
        });

        // 监听插件目录变化
        this.watcher
            .on('addDir', async dir => {
                const ready = await this.isPluginReady(dir);
                if (ready) await this.loadPlugin(dir);
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
            if (stat.isDirectory()) {
                await this.loadPlugin(fullPath);
            }
        }
    }

    // 加载单个插件
    async loadPlugin(pluginDir, retryCount = 3) {
        try {
            // 读取插件配置
            const configPath = path.join(pluginDir, 'config.json');
            const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

            // 创建沙箱环境
            const sandbox = this.createSandbox(config.id, pluginDir);
            this.sandboxes.set(config.id, sandbox);

            // 加载插件主文件
            const mainPath = path.join(pluginDir, 'main.js');
            const code = await fs.readFile(mainPath, 'utf-8');

            // 在沙箱中执行插件代码
            const script = new vm.Script(code, { filename: mainPath });
            script.runInContext(sandbox);

            // 获取插件导出的类
            const PluginClass = sandbox.exports.Plugin ||
                sandbox.module.exports.Plugin ||
                sandbox.Plugin;

            if (!PluginClass) {
                throw new Error('Plugin class not exported correctly');
            }

            // 创建插件实例
            const plugin = new PluginClass(config.id, config.name, config, pluginDir);

            // 初始化插件
            await plugin.init();

            // 存储插件
            this.plugins.set(config.id, plugin);
            this.pluginDirs.add(pluginDir);

            console.log(`Plugin loaded: ${plugin.id} on ${plugin.path}`);
        } catch (err) {
            if (retryCount > 0) {
                console.log(`Retrying load plugin (${4 - retryCount}/3) for ${pluginDir}`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 等待500ms
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
        return function scopedRequire(mod) {
            try {
                // First try to resolve in the plugin's node_modules
                return originalRequire(
                    require.resolve(mod, { paths: [path.join(pluginDir, 'node_modules')] })
                );
            } catch (e) {
                // Fall back to the parent's node_modules or core modules
                console.log("require error", e);
                return originalRequire(mod);
            }
        };
    }
    œ
    // 重新加载插件
    async reloadPlugin(changedFile) {
        const pluginDir = path.dirname(changedFile);
        if (this.pluginDirs.has(pluginDir)) {
            await this.unloadPlugin(pluginDir);
            await this.loadPlugin(pluginDir);
        }
    }

    // 卸载插件
    async unloadPlugin(pluginDir) {
        const pluginId = path.basename(pluginDir);
        const plugin = this.plugins.get(pluginId);

        if (plugin) {
            try {
                await plugin.destroy();
            } catch (err) {
                console.error(`Error destroying plugin ${pluginId}:`, err);
            }

            this.plugins.delete(pluginId);
            this.pluginDirs.delete(pluginDir);
            this.sandboxes.delete(pluginId);

            console.log(`Plugin unloaded: ${pluginId}`);
        }
    }

    // 安装插件依赖
    async installPluginDependencies(pluginId) {
        try {
            let plugin = this.plugins.get(pluginId);
            let ret = await plugin.installDependencies();

            return { status: true, msg: "server.install_success" };
        } catch (error) {
            return {
                status: true,
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

            return {
                status: true,
                msg: `server.install_success_multi`,
                i18n: {
                    install_count: success_count,
                    error_count: fail_count
                }
            };
        } catch (error) {
            return {
                status: true,
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