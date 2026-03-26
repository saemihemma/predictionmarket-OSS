# Frontend production image for the public web app.
FROM node:22-slim AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /app/frontend
RUN npm ci

WORKDIR /app
COPY scripts ./scripts
COPY deployments ./deployments
COPY frontend ./frontend
RUN node ./scripts/sync-protocol-manifest.mjs

WORKDIR /app/frontend
RUN npm run build

FROM node:22-slim
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/frontend/dist ./dist
EXPOSE 8080
CMD ["serve", "dist", "-s", "-l", "8080"]
