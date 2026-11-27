# ── build ──
FROM node:22-slim AS build
# The SQLite engine (better-sqlite3) is compiled at install time: it needs a compiler.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Build the site and the server, then keep only what the server needs to run.
RUN npm run build && npm prune --omit=dev

# ── runtime ──
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
COPY package.json ./
# Already compiled in the build stage: no compiler in the final image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The SQLite database and the uploaded files live here: mount a persistent volume.
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "dist/server.js"]
