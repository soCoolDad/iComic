class user {
    constructor() {

    }

    create(req, res, helpers) {
        let name = req.body.name?.trim();
        let password = req.body.password;
        let repassword = req.body.repassword;

        // 校验用户名
        if (!name || name.length < 4) {
            return { status: false, msg: '用户名不能为空且长度不能少于4位' };
        }
        // 校验密码
        if (!password || !repassword) {
            return { status: false, msg: '密码和确认密码不能为空' };
        }
        if (password !== repassword) {
            return { status: false, msg: '两次输入的密码不一致' };
        }
        if (password.length < 6) {
            return { status: false, msg: '密码长度不能少于6位' };
        }

        // 检查用户名是否已存在
        const exist = helpers.db_query.get('SELECT id FROM user WHERE name = ?', [name]);
        if (exist) {
            return { status: false, msg: '用户名已存在' };
        }

        // 密码加密（简单hash，可根据需要更换为更安全的加密方式）
        const hash = helpers.token.hashPassword(password);

        // 插入用户
        const info = helpers.db_query.run(
            'INSERT INTO user (name, password, is_admin) VALUES (?, ?, ?)',
            [name, hash, 1]
        );

        // 生成jwt token
        const token = helpers.token.sign({ id: info.lastInsertRowid, name, isAdmin: true });

        return {
            status: true,
            data: {
                id: info.lastInsertRowid,
                name: name,
                isAdmin: true,
                token: token
            }
        }
    }

    // 登录
    login(req, res, helpers) {
        /**
         * {
         *     status: true,
         *     data: {
         *         id: 1,
         *         name: 'admin',
         *         isAdmin: true,
         *         token: 'xxx'
         }
         * }
         */
    }
}

module.exports = user