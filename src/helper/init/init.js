const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

class init {
    constructor() { }

    check(inDbDir) {
        /**
         * 0: 不存在
         * 1: 存在但无用户
         * 2: 存在且有用户
         */
        const dbDir = path.join(__dirname, inDbDir)
        const dbFile = path.join(dbDir, 'data.db')
        // 检查 /db 目录和数据库文件是否存在
        if (!fs.existsSync(dbDir) || !fs.existsSync(dbFile)) {
            return 0
        }
        // 尝试连接数据库并检查 user 表
        try {
            const db = new Database(dbFile, { readonly: true })
            // 检查 user 表是否存在
            const tableExists = db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='library'"
            ).get()
            if (!tableExists) {
                db.close()
                return 1 // 数据库存在但无library表
            }
            // 检查 library 表是否有文件
            const user = db.prepare("SELECT id FROM library LIMIT 1").get()
            db.close()
            if (user) {
                return 2 // 存在且有文件
            } else {
                return 1 // 存在但无文件
            }
        } catch (e) {
            return 0
        }
    }

    /**
     * 初始化数据库和表
     * @param {string} [dbDir] 可选，数据库目录，默认 '../../../db'
     */
    init(dbDir) {
        dbDir = dbDir
        const dbFile = path.join(dbDir, 'data.db')
        // 创建目录

        if (!dbDir) {
            return;
        }

        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true })
        }
        // 创建数据库
        const db = new Database(dbFile)
        // 创建表
        db.exec(`
            CREATE TABLE IF NOT EXISTS tag (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS library_progress (
                library_id INTEGER,
                read_page_progress INTEGER DEFAULT 0,
                read_update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (library_id)
            );
            CREATE TABLE IF NOT EXISTS library (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                page_count INTEGER DEFAULT 0,
                author TEXT,
                description TEXT,
                path TEXT,
                config_path TEXT,
                plugin_id TEXT NOT NULL,
                update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS library_tag (
                library_id INTEGER,
                tag_id INTEGER,
                PRIMARY KEY (library_id, tag_id)
            );
            CREATE TABLE IF NOT EXISTS download_task (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plugin_id TEXT NOT NULL,
                name TEXT NOT NULL,
                search_result TEXT NOT NULL,
                status INTEGER DEFAULT 0,
                page_count INTEGER DEFAULT 0,
                page_complete_count INTEGER DEFAULT 0,
                page_fail_count INTEGER DEFAULT 0,

                current_page_count INTEGER DEFAULT 0,
                current_page_complete_count INTEGER DEFAULT 0,
                current_page_fail_count INTEGER DEFAULT 0
            );
        `)
        db.close()
    }
}

module.exports = init