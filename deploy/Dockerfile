# Server image used by deploy/docker-compose.yml. Same as the root Dockerfile, except a
# lock file written by a different npm version (npm ci refuses it) falls back to
# npm install instead of failing the deploy.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund || { echo "package-lock.json is out of sync; using npm install"; npm install --no-audit --no-fund; }
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
