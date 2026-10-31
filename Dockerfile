# syntax=docker/dockerfile:1
# Public browser configuration is baked into the Vite bundle at build time.
# Never pass a service-role key or other secret through VITE_* build arguments.
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# Vite/Tailwind require their platform-specific optional native dependencies.
# Supply a managed cloud proxy CA as a BuildKit secret when required.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true; \
    else \
      npm ci --strict-ssl=true; \
    fi

COPY . .
ARG VITE_BACKEND_PROVIDER=cloud
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ALLOW_LOCAL_SANDBOX=false
RUN npm run build

FROM nginx:1.28-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
RUN nginx -t
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -Y off --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
