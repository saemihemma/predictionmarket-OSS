FROM node:18-slim AS build
WORKDIR /app
COPY frontend/package.json ./
RUN npm install
COPY frontend/ .
RUN npx vite build

FROM node:18-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
RUN npm install --omit=dev
EXPOSE 3000
CMD ["npx", "vite", "preview", "--port", "3000", "--host", "0.0.0.0"]
