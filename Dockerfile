# ============================================================
#  clinic-auth-service — Dockerfile multi-stage
#  Stage 1: deps     — instala dependencias (compila argon2 nativo)
#  Stage 2: builder  — compila TypeScript → JavaScript
#  Stage 3: runner   — imagen final mínima sin build tools
# ============================================================

# ---- Stage 1: deps ------------------------------------------
# Node Alpine con build tools para compilar argon2 (binario nativo)
# Los build tools NO llegan a la imagen final
FROM node:22.11.0-alpine3.20 AS deps

# Instalar build tools necesarios para argon2
# Solo en este stage — la imagen final no los tendrá
RUN apk add --no-cache python3 make g++ libc6-compat

# Activar pnpm via corepack — sin npm install -g
RUN npm install -g pnpm@10.33.0

WORKDIR /app

# Copiar manifiestos ANTES del código fuente
# Esto aprovecha el cache de Docker: si package.json no cambia,
# pnpm install no se re-ejecuta aunque cambie el código
COPY package.json pnpm-lock.yaml ./

# --frozen-lockfile — falla si el lockfile no coincide con package.json
# Garantiza builds reproducibles — sin sorpresas por resolución de deps
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- Stage 2: builder ---------------------------------------
FROM node:22.11.0-alpine3.20 AS builder

RUN npm install -g pnpm@10.33.0

WORKDIR /app

# Copiar node_modules del stage anterior (con binarios compilados)
COPY --from=deps /app/node_modules ./node_modules

# Copiar todo el código fuente
COPY . .

# Compilar TypeScript → JavaScript en dist/
RUN pnpm build

# Re-instalar SOLO dependencias de producción
# Elimina devDependencies (@nestjs/cli, ts-jest, etc.)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ---- Stage 3: runner ----------------------------------------
# Imagen final — sin Node dev tools, sin código fuente .ts
FROM node:22.11.0-alpine3.20 AS runner

# dumb-init como PID 1:
# - Reenvía SIGTERM al proceso Node (graceful shutdown)
# - Cosecha procesos zombies
# Sin dumb-init, SIGTERM llega a Node pero Docker puede matar
# el proceso antes de que termine las conexiones activas
RUN apk add --no-cache dumb-init libc6-compat

# Crear directorio de trabajo con permisos correctos
WORKDIR /app

# Usuario no-root — si hay RCE, el atacante no obtiene root en el host
# node (uid 1000) ya viene en la imagen oficial de Node
USER node

# Copiar solo lo necesario desde el builder:
# - dist/   → código JavaScript compilado
# - node_modules/ → dependencias de producción únicamente
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Variables de entorno de producción
ENV NODE_ENV=production
ENV PORT=3001
# Necesario para que Node encuentre los módulos
ENV HOME=/app

# Exponer el puerto del microservicio
EXPOSE 3001

# Healthcheck — el orquestador (K8s) marca el contenedor como unhealthy
# si este comando falla, reemplazándolo automáticamente
# Usamos node inline para no necesitar curl/wget en la imagen
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/auth/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })" || exit 1

# dumb-init como entrypoint — gestiona señales correctamente
ENTRYPOINT ["dumb-init", "--"]

# Arrancar la app compilada
CMD ["node", "dist/main"]
