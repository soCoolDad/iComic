const path = require('path');
const Database = require('better-sqlite3');

class db_query {
    constructor() {
        this.dbPath = null;
        this.dbInstance = null;
    }

    // 初始化数据库文件目录
    init(dbDir) {
        this.dbPath = path.join(dbDir, 'data.db');
        this.dbInstance = null; // 重置实例
    }

    // 获取数据库实例（单例）
    getDB() {
        if (!this.dbPath) {
            throw new Error('db_query: dbPath not set, please call init(dbDir) first.');
        }
        if (!this.dbInstance) {
            this.dbInstance = new Database(this.dbPath);
        }
        return this.dbInstance;
    }

    // 查询一条记录
    get(sql, params = []) {
        return this.getDB().prepare(sql).get(...params);
    }

    // 执行写入/更新/删除
    run(sql, params = []) {
        //console.log("db_query.run:", sql, params)
        return this.getDB().prepare(sql).run(...params);
    }

    // 查询多条记录
    all(sql, params = []) {
        return this.getDB().prepare(sql).all(...params);
    }
}

module.exports = db_query