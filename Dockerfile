# For one-click deploy on a Vultr (or any) VM: docker build -t friend-stocks . && docker run -p 3000:3000 --env-file .env.local friend-stocks
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
