FROM node:22-bookworm-slim
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true CHROME_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY services/whatsapp/package*.json ./
RUN npm ci --omit=dev
COPY services/whatsapp/*.mjs ./
USER node
CMD ["node", "server.mjs"]
