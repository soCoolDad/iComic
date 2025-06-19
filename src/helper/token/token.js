const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SECRET = 'iComicSecretKey'; // 建议放到配置文件或环境变量

class token {
    // 生成JWT
    sign(payload, expiresIn = '7d') {
        return jwt.sign(payload, SECRET, { expiresIn });
    }

    // 校验JWT
    verify(tokenStr) {
        try {
            return jwt.verify(tokenStr, SECRET);
        } catch (e) {
            return null;
        }
    }

    // 密码加密（sha256）
    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    // 注销（前端只需丢弃token，后端可选黑名单机制）
    signOut() {
        // 可扩展黑名单等机制
        return true;
    }
}

module.exports = token