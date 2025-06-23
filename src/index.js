const fs = require('fs-extra');
const path = require('path')

const express = require('express');
const app = express();
const port = process.env.SERVER_PORT || 3000;

const helpers = require('./helper');
const apis = require('./api');

//设置更新仓库
process.env.UPDATE_REPO = process.env.UPDATE_REPO || "soCoolDad/iComic";

//打印环境
//console.log("init", "env:", process.env);

process.on('uncaughtException', (err) => {
    console.error('未捕获异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', '原因:', reason, promise);
});

// Middleware to parse JSON bodies
app.use(express.json());

// 获取根目录
rootDir = path.join(__dirname, "/../");
console.log("init", "root dir:", rootDir);

// 获取配置文件目录
configDir = process.env.CONFIG_DIR || path.join(rootDir, "configs");
console.log("init", "config dir:", configDir);

//初始化 setting
apis.setting.init(configDir);
console.log("init", "setting dir:", configDir);

// 初始化数据库
dbDir = path.join(configDir, "db");
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
        fs.copySync(path.join(rootDir, "configs"), configDir, { overwrite: true });
    }
}

helpers.db_query.init(dbDir);
console.log("init", "db dir:", dbDir);

// 初始化 plugin
pluginDir = path.join(configDir, "plugin");
if (fs.existsSync(pluginDir) === false) {
    fs.mkdirSync(pluginDir, { recursive: true });
}
helpers.plugin.init(pluginDir);
console.log("init", "plugin dir:", pluginDir);

//初始化库
libraryDir = path.join(configDir, "library");
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
            // 传递 helpers 给每个 API 方法
            const result = await mod[method](req, res, helpers)

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
                } else if (typeof result === 'object' && result.status !== "undefined") {
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
    app.get('*', (req, res) => {
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