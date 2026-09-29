const fs = require('fs-extra');
const path = require('path')

const express = require('express');
const app = express();
const port = process.env.SERVER_PORT || 3000;

// 获取根目录
let rootDir = path.join(__dirname, "/../");
console.log("init", "root dir:", rootDir);

// 获取配置文件目录
let configDir = process.env.CONFIG_DIR || path.join(rootDir, "configs");
console.log("init", "config dir:", configDir);
//解析system.json
const SettingJson = require(path.join(configDir, "system.json"));
//将需要复制到环境的变量加载到环境变量
(SettingJson.COPT_TO_EVN || []).forEach(key => {
    if (SettingJson[key]) {
        process.env[key] = SettingJson[key]
    }
});

const apis = require('./api');
const helpers = require('./helper');

//设置更新仓库
process.env.UPDATE_REPO = process.env.UPDATE_REPO || "soCoolDad/iComic";

//打印环境
//console.log("init", "env:", process.env);

process.on('uncaughtException', (err) => {
    console.error('未捕获异常:', err);
    helpers.db_query.close();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', '原因:', reason, promise);
});

// 优雅关闭：关闭数据库连接防止 better-sqlite3 GC 崩溃
process.on('SIGINT', () => {
    helpers.db_query.close();
    process.exit(0);
});
process.on('SIGTERM', () => {
    helpers.db_query.close();
    process.exit(0);
});
process.on('beforeExit', () => {
    helpers.db_query.close();
});

// Middleware to parse JSON bodies (with size limit)
app.use(express.json({ limit: '10mb' }));

// CORS middleware (support reverse proxy and cross-origin)
app.use((req, res, next) => {
    const allowedOrigins = process.env.ICOMIC_CORS_ORIGINS || '*';
    const origin = req.headers.origin;
    if (allowedOrigins === '*' || (origin && allowedOrigins.split(',').map(s => s.trim()).includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
        res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// Optional API key authentication (enabled when ICOMIC_API_KEY is set)
app.use((req, res, next) => {
    const apiKey = process.env.ICOMIC_API_KEY;
    if (!apiKey) return next();
    if (req.path.startsWith('/api/') && req.method !== 'OPTIONS') {
        // EventSource（SSE 长连接）无法自定义请求头，因此额外接受 ?api_key= 传参
        const providedKey = req.headers['x-api-key']
            || req.headers['authorization']?.replace(/^Bearer\s+/i, '')
            || req.query.api_key;
        if (providedKey !== apiKey) {
            return res.status(401).json({ status: false, msg: 'Unauthorized: invalid API key' });
        }
    }
    next();
});

// 初始化数据库
let dbDir = path.join(configDir, "db");
if (fs.existsSync(dbDir) === false) {
    fs.mkdirSync(dbDir, { recursive: true });
}
if (helpers.init.check(dbDir) === 0) {
    //如果是第一次打开
    // 1.创建数据库
    helpers.init.init(dbDir);
    // 2.如果配置目录不一致，更新插件
    if (configDir !== path.join(rootDir, "configs")) {
        //将配置文件夹复制到根目录
        //更新插件和文件
        console.log("init", "update plugins", configDir);
        fs.copySync(path.join(rootDir, "configs"), configDir, { overwrite: true });
    }
}
helpers.db_query.init(dbDir);
// 无条件执行增量迁移（老库补齐按需下载字段）
helpers.init.migrate(dbDir);
console.log("init", "db dir:", dbDir);

//初始化 setting
apis.setting.init(configDir);
console.log("init", "setting dir:", configDir);


// 初始化 plugin
let pluginDir = path.join(configDir, "plugin");
if (fs.existsSync(pluginDir) === false) {
    fs.mkdirSync(pluginDir, { recursive: true });
}
// 插件是异步加载的：把 init 的 Promise 挂到 helpers 上，由路由在处理请求前 await。
// CommonJS 顶层不能 await，原先的 fire-and-forget 会让启动瞬间的请求命中
// 「插件还没加载完」而报 server.no_plugin
helpers.plugin.ready = helpers.plugin.init(pluginDir).catch(e => {
    console.error("init plugin error:", e);
});
console.log("init", "plugin dir:", pluginDir);

//初始化库
let libraryDir = path.join(configDir, "library");
if (fs.existsSync(libraryDir) === false) {
    fs.mkdirSync(libraryDir, { recursive: true });
}
helpers.library.init(libraryDir);
console.log("init", "library dir:", libraryDir);

//初始化下载
helpers.download.init(helpers, libraryDir);
console.log("init", "download");

// 通用 API 路由
app.all('/api/:module/:method', async (req, res) => {
    const { module, method } = req.params
    const mod = apis[module]

    //console.log(module, method, apis, helpers);

    if (mod && typeof mod[method] === 'function') {
        try {
            // 等待插件就绪后再处理请求（Promise 已 settle 时 await 只有微任务开销）
            if (helpers.plugin.ready) {
                await helpers.plugin.ready;
            }

            // 传递 helpers 给每个 API 方法
            const result = await mod[method](req, res, helpers)

            // 接口已自行接管响应（如 SSE 长连接），不能再写 JSON
            if (res.headersSent) return;

            if (result !== undefined) {
                // 如果返回的是json对象
                if (typeof result === 'object' && result.serverbacktype === 'image') {
                    res.type(`image/${result.ext || "jpeg"}`);
                    res.send(result.data);
                    return;
                } else if (typeof result === 'object' && result.serverbacktype === 'txt') {
                    //res.type(`text/plain`);
                    //返回纯文本
                    let str = Buffer.from(result.data).toString('utf-8');
                    res.json({ status: true, data: str });
                    return;
                } else if (typeof result === 'object' && result.status !== undefined) {
                    res.json(result)
                    return;
                }
            }

            res.json({ status: true, data: result })
        } catch (e) {
            console.log("server:500", e);
            res.status(500).json({ status: false, msg: e.message })
        }
    } else {
        res.status(404).json({ status: false, error: 'API not found' })
    }
});
console.log("init", "api");

// 检查是否编译web
let web_build_dir = path.join(rootDir, "web", "dist");
console.log("check", "web build dir:", web_build_dir);
if (fs.existsSync(path.join(web_build_dir, "index.html"))) {
    // 托管静态资源
    app.use(express.static(web_build_dir));

    // 返回 index.html
    app.get('/*', (req, res) => {
        res.sendFile(path.join(web_build_dir, 'index.html'));
    });

    console.log("init", "server", "from", web_build_dir);
} else {
    // Send Hellow
    app.get('/', (req, res) => {
        res.send('Welcome to iComic API!');
    });
    console.log("init", "server", "/");
}

// 支持域名与反代
// 关键！解决域名报错
app.set('trust proxy', true);

// Start the server
app.listen(port, () => {
    console.log(`iComic app listening at http://localhost:${port}`);
});