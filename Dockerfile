FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package.json ./
RUN rm -rf node_modules package-lock.json && npm install
COPY frontend/ .
RUN rm -rf node_modules package-lock.json && npm install && npx vite build

FROM node:22-slim
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["serve", "dist", "-l", "8080"]
