# 使用官方 Node.js LTS 版本
FROM node:20-alpine

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 设置工作目录
WORKDIR /app

# 1. 复制包管理文件（利用Docker缓存层）
COPY package*.json ./
COPY web/package*.json ./web/

# 2. 安装依赖（推荐使用npm或yarn）
RUN npm install -g cnpm && \
    cnpm install -g concurrently && \
    cnpm install && \
    cd web && \
    cnpm install && \
    cd .. 

# 3. 复制项目文件
COPY . .

# 4. 暴露配置目录和端口
VOLUME /app/configs
EXPOSE 3000
ENV NODE_ENV=production \
    CONFIG_DIR="/app/configs/" \
    SERVER_PORT=3000 \
    UPDATE_REPO="soCoolDad/iComic"
# 5. 启动命令
CMD ["npm run all"]