# 使用官方 Node.js LTS 版本
FROM node:20-alpine

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 设置工作目录
WORKDIR /app

# 1. 复制项目目录
COPY package*.json ./
COPY src src
COPY web web

RUN mkdir configs
# 2. 复制主要插件
COPY configs/plugin/cbzFileParse configs/plugin/cbzFileParse 
COPY configs/plugin/lang-en configs/plugin/lang-en  
COPY configs/plugin/lang-zh-cn configs/plugin/lang-zh-cn

# 3. 安装依赖（推荐使用npm或yarn）
RUN npm install -g cnpm && \
    cnpm install && \
    cd web && \
    cnpm install && \
    cnpm run build && \
    cd .. 

# 4. 暴露配置目录和端口
VOLUME /configs
EXPOSE 3000
ENV NODE_ENV=production \
    CONFIG_DIR="/configs" \
    SERVER_PORT=3000 \
    UPDATE_REPO="soCoolDad/iComic"
# 5. 启动命令
CMD ["cnpm", "run", "start"]