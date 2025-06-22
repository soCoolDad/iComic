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
COPY src src
COPY web web

RUN mkdir configs
# 2. #忽略其他的插件，只上传必要的插件，嘿嘿
COPY configs/plugin/cbzFileParse configs/plugin/cbz_file_parse
COPY configs/plugin/cbzFileParse configs/plugin/ictz_file_parse
COPY configs/plugin/lang-en configs/plugin/lang-en  
COPY configs/plugin/lang-zh-cn configs/plugin/lang-zh-cn

# 3. 创建pm2日志目录
RUN mkdir -p /var/log/pm2
# 4. 安装依赖（推荐使用npm或yarn）
RUN npm install -g cnpm && \
    npm install -g pm2 && \
    cnpm install && \
    cd web && \
    cnpm install && \
    cnpm run build && \
    cd .. 

# 5. 暴露配置目录和端口
VOLUME /configs
EXPOSE 3000
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=1024" \
    CONFIG_DIR="/configs" \
    SERVER_PORT=3000 \
    UPDATE_REPO="soCoolDad/iComic"
# 6. 启动命令
#CMD ["cnpm", "run", "start"]
CMD ["pm2-runtime", "start", "src/index.js"]