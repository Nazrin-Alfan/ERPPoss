# ==============================================================================
# RELAYPOS DOCKERFILE - MULTI-STAGE BUILD
# Stage 1: Build Frontend (Node 20 Alpine)
# Stage 2: Production Web Server (Nginx Alpine)
# ==============================================================================

# STAGE 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Salin package manifest untuk caching layer Docker
COPY package*.json ./

# Install dependensi (mengabaikan optional binding platform-spesifik)
RUN npm ci --omit=optional

# Salin source code
COPY . .

# Build aplikasi Vite
RUN npm run build

# STAGE 2: Nginx Web Server
FROM nginx:alpine

# Salin konfigurasi Nginx khusus SPA dengan caching dan Gzip
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Salin hasil build dari Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Port HTTP standar container
EXPOSE 80

# Healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
