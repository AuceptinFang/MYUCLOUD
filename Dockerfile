FROM node:22-alpine

WORKDIR /app

# 用一个支持的 shell（alpine 默认 sh 已够用）
ENV HOST=0.0.0.0

# package.json 先拷进来，依赖装到匿名卷里（见 compose）
# 这样源码挂载不会覆盖 node_modules
COPY package.json package-lock.json ./
RUN npm install

EXPOSE 5173

# dev server —— 配合 compose 的源码挂载，改代码即热更新
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
