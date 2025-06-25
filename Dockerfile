# 使用官方 Node.js LTS 版本
FROM node:20-alpine

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
COPY .npmrc ./
COPY src src
COPY web web

RUN mkdir configs
# 2. #忽略其他的插件，只上传必要的插件，嘿嘿
COPY configs/system.json configs/system.json
COPY configs/plugin/cbz_file_parse configs/plugin/cbz_file_parse
COPY configs/plugin/ictz_file_parse configs/plugin/ictz_file_parse
COPY configs/plugin/lang-en configs/plugin/lang-en  
COPY configs/plugin/lang-zh-cn configs/plugin/lang-zh-cn

# 3. 安装依赖（推荐使用npm或yarn）
RUN mkdir -p /var/log/pm2 && \
    npm install -g pm2 && \
    npm install && \
    cd web && \
    npm install && \
    npm run build && \
    cd .. 

# 4. 暴露配置目录和端口
VOLUME /configs
EXPOSE 3000
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=512" \
    CONFIG_DIR="/configs" \
    SERVER_PORT=3000 \
    UPDATE_REPO="soCoolDad/iComic" \
    GITHUB_PAT=""
# 5. 启动命令
CMD ["pm2-runtime", "start", "src/index.js"]