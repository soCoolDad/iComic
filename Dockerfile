# 使用官方 Node.js LTS 版本
FROM node:22-alpine

# 安装构建依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    zip \
    unzip \
    rsync

# 设置工作目录
WORKDIR /app

# 1. 复制项目目录
COPY package*.json ./
COPY web/package*.json ./web/
COPY src src
COPY web web

RUN mkdir configs
# 2. #忽略其他的插件，只上传必要的插件，嘿嘿
COPY configs/system.json configs/system.json
COPY configs/plugin/cbz_file_parse configs/plugin/cbz_file_parse
COPY configs/plugin/ictz_file_parse configs/plugin/ictz_file_parse
COPY configs/plugin/lang-en configs/plugin/lang-en  
COPY configs/plugin/lang-zh-cn configs/plugin/lang-zh-cn

# 3. 安装依赖（使用国内镜像加速）
ENV npm_config_registry=https://registry.npmmirror.com \
    npm_config_disturl=https://cdn.npmmirror.com/binaries/node
RUN mkdir -p /var/log/pm2 && \
    npm install -g pm2
RUN npm install
WORKDIR /app/web
RUN npm install
RUN npm run build
WORKDIR /app

# 4. 暴露配置目录和端口
VOLUME /configs
EXPOSE 3000
ENV NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=512" \
    CONFIG_DIR="/configs" \
    SERVER_PORT=3000 \
    UPDATE_REPO="soCoolDad/iComic" \
    GITHUB_PAT=""
# 5. 启动命令
CMD ["pm2-runtime", "start", "src/index.js"]