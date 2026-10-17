# syntax=docker/dockerfile:1

# Versions come from .env via docker-compose.yml (build args); these are fallbacks.
ARG NODE_VERSION=24
ARG CADDY_VERSION=2

# --- build: typecheck, unit tests, production bundle ---------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm test && npm run build

# --- runtime: static files served by Caddy (automatic HTTPS when a domain is set)
FROM caddy:${CADDY_VERSION}-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80 443 443/udp
