# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY src ./src
COPY views ./views

# Build CSS for production
RUN npm run build:css

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

ENV VIEWS_DIR=/app/views

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/views ./views

EXPOSE 3000

USER node

CMD ["node", "dist/index.js"]
