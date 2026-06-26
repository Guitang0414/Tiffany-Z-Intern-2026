# Hermes Agent 生产镜像。多阶段:编译 TS + 原生 better-sqlite3,运行时只留 prod 依赖。
FROM node:18-alpine AS build
# better-sqlite3 原生编译需要工具链
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- 运行时:无工具链,只带编译产物 + prod node_modules(含已编译的 .node 二进制) ---
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /app/cache
# 内部 worker:不暴露端口、不需要 HTTP。自带 cron。
CMD ["node", "dist/main.js"]
