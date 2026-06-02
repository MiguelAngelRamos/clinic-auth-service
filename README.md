# clinic-auth-service

Microservicio de autenticación de la **Clinic App**.

Responsabilidad única: emitir, rotar y revocar tokens JWT. Gestionar el ciclo de vida de sesiones.

## Stack

- **NestJS 11** · Node 22 · TypeScript 5
- **PostgreSQL 16** — BD propia (tabla `users`, solo campos de auth)
- **Valkey 8** — blocklist de access tokens en logout
- **Argon2id** — hashing de passwords y refresh tokens
- **JWT dual-token** — access (15m) + refresh (7d, HttpOnly cookie)

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/auth/register` | Público | Registro (rol forzado PATIENT) |
| `POST` | `/auth/login` | Público | Login — emite par de tokens |
| `POST` | `/auth/refresh` | Cookie | Rota el refresh token |
| `POST` | `/auth/logout` | Bearer | Invalida tokens |
| `GET`  | `/auth/validate` | Bearer | Validación interna para Kong |
| `GET`  | `/auth/health` | Público | Health check para K8s probes |

## Desarrollo local

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar .env
cp .env.example .env
# Completar los valores en .env

# 3. Levantar PostgreSQL y Valkey con Docker
docker run -d --name auth-postgres \
  -e POSTGRES_USER=auth_user \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=auth_db \
  -p 5432:5432 postgres:16-alpine

docker run -d --name auth-valkey \
  -p 6379:6379 valkey/valkey:8-alpine \
  valkey-server --requirepass changeme

# 4. Ejecutar migraciones
pnpm migration:run

# 5. Arrancar en modo desarrollo
pnpm start:dev
```

## Kubernetes

```bash
# 1. Crear Secrets (NUNCA en YAML con valores reales)
kubectl create secret generic auth-postgres-secret \
  --namespace clinic \
  --from-literal=POSTGRES_USER=auth_user \
  --from-literal=POSTGRES_PASSWORD=<PASSWORD> \
  --from-literal=POSTGRES_DB=auth_db

kubectl create secret generic auth-valkey-secret \
  --namespace clinic \
  --from-literal=VALKEY_PASSWORD=<PASSWORD>

kubectl create secret generic auth-jwt-secret \
  --namespace clinic \
  --from-literal=JWT_SECRET=$(openssl rand -base64 48) \
  --from-literal=JWT_REFRESH_SECRET=$(openssl rand -base64 48) \
  --from-literal=SWAGGER_PASSWORD=<PASSWORD>

# 2. Aplicar manifiestos
kubectl apply -f k8s/auth-service.yaml

# 3. Verificar
kubectl get pods -n clinic -l app=auth-service
kubectl logs -n clinic deployment/auth-service
```

## Migraciones

### Desarrollo (sobre TypeScript, con ts-node y `ormconfig.ts`)

```bash
pnpm migration:run      # aplicar pendientes
pnpm migration:revert   # revertir la última
pnpm migration:show     # ver estado
pnpm migration:generate # generar desde diff de entidades
```

### Producción / Docker (sobre código compilado)

La imagen de producción solo contiene `dist/` y `node_modules` (sin scripts de
pnpm). Tras desplegar, ejecuta las migraciones **manualmente** dentro del
contenedor usando el DataSource compilado `dist/database/data-source.js`:

```bash
node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

Las variables de entorno de BD (`DB_HOST`, `DB_PORT`, `DB_USERNAME`,
`DB_PASSWORD`, `DB_NAME`, `DB_SSL`) deben estar presentes en el contenedor.
No se ejecutan automáticamente al arrancar (`migrationsRun` está desactivado a
propósito) para mantener el control sobre cuándo se aplican.

## Principios de diseño

- **Responsabilidad única** — solo autenticación, nada más
- **BD propia** — ningún otro servicio accede a esta BD
- **Sin código compartido** — no hay paquetes npm compartidos con otros servicios
- **Contrato por API** — el contrato con otros servicios es la especificación OpenAPI
- **Fail-fast** — secretos JWT < 32 bytes en producción abortan el arranque
- **Fail-open en Valkey** — si la blocklist cae, `isActive` es la defensa principal
