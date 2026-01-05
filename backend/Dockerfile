FROM alibaba-cloud-linux-3-registry.cn-hangzhou.cr.aliyuncs.com/alinux3/node:20.16 AS builder
WORKDIR /app
USER root
COPY package*.json ./
COPY tsconfig.json ./
RUN \
    # 1. 清理原有 yum 缓存（仅保留必要步骤，用 Alinux3 官方源）
    yum clean all && \
    # 2. 生成 yum 缓存（移除 fast 参数，适配 Alinux3）
    yum makecache && \
    # 3. 安装 Node.js + 编译依赖（用 Alinux3 官方源，无需 EPEL）
    yum install -y --nogpgcheck nodejs python3 make gcc-c++ && \
    # 4. 验证 Node.js 和 npm 版本（调试用，可选）
    node -v && npm -v && \
    # 5. 配置 npm 国内源 + 关闭严格模式（避免依赖校验报错）
    npm config set registry https://registry.npmmirror.com && \
    npm config set strict-ssl false && \
    # 6. 安装 npm 依赖（ci 失败时降级为 install，提升兼容性）
    npm ci || npm install && \
    # 7. 仅清理编译依赖（保留 nodejs！后续 build 需要）
    yum remove -y python3 make gcc-c++ && \
    # 8. 清理 yum 缓存（减小镜像体积）
    yum clean all && \
    rm -rf /var/cache/yum/* /root/.npm/_logs/*
COPY src ./src
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build
RUN npm prune --omit=dev

FROM alibaba-cloud-linux-3-registry.cn-hangzhou.cr.aliyuncs.com/alinux3/node:20.16
WORKDIR /app
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
