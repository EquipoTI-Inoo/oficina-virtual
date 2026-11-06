# Portal Next.js (UI + /api/v1). Construir desde apps/portal:  docker build -t inoo-portal .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Un build real usa la fecha de hoy. Para fijarla en un entorno con datos de demo: --build-arg NEXT_PUBLIC_FECHA_FIJA=2026-10-06
ARG NEXT_PUBLIC_FECHA_FIJA=""
ENV NEXT_PUBLIC_FECHA_FIJA=$NEXT_PUBLIC_FECHA_FIJA
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# Chromium para el taller web (capturas de referencias y PDF del benchmark; NAVEGADOR_MODO=real).
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont font-noto font-noto-emoji
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/node_modules/playwright-core ./node_modules/playwright-core
USER app
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/ingresar >/dev/null || exit 1
CMD ["node", "server.js"]
