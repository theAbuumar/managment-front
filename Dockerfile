# Сайт для стенда (Ф13 13.D3): сборка фронта и раздача через Caddy.
#
# Caddy отдаёт статику и проксирует /api на бэк, так что сайт и API живут на
# одном адресе (ADR-003). По адресу https://… Caddy сам получает сертификат
# Let's Encrypt. Запускается из корневого docker-compose.yml, адрес — SITE_URL.

# --- build -------------------------------------------------------------------
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Пустой VITE_API_URL: запросы идут на относительный /api/v1 того же адреса
# (src/api/client.ts).
ENV VITE_API_URL=
RUN npm run build

# --- runtime -----------------------------------------------------------------
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
