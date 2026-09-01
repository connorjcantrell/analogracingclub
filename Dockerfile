# Analog Racing Club — Node app image. Mongo runs as a separate compose service.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8004
EXPOSE 8004

CMD ["node", "src/server.js"]
