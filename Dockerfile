# Analog Racing Club — SvelteKit (adapter-node) app image. Mongo runs as a
# separate compose service. Two stages: build the site, then ship only the
# server bundle plus production dependencies.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY svelte.config.js vite.config.js ./
COPY src ./src
COPY static ./static
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/build ./build
# The ingest CLI and the domain modules it needs (also bundled into build/).
COPY src/lib/server ./src/lib/server

ENV NODE_ENV=production
ENV PORT=8004
# Result JSON uploads run to a few MB and photo uploads to tens of MB; the
# routes enforce their own caps.
ENV BODY_SIZE_LIMIT=256M
EXPOSE 8004

CMD ["node", "build"]
