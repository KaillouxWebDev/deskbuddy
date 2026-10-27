# syntax=docker/dockerfile:1

# Étape de build sur la plateforme du runner (rapide, pas d'émulation ARM) :
# le front buildé et les dépendances serveur sont du pur JS, valables sur le Pi.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY vite.config.js ./
COPY web ./web
RUN npm run build && npm prune --omit=dev

# Image finale ARM64 : uniquement des copies, aucune commande à émuler.
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
VOLUME /data
EXPOSE 8080
CMD ["node", "server/index.js"]
