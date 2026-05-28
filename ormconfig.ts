// ormconfig.ts — DataSource para el CLI de TypeORM
// Solo se usa para generar y ejecutar migraciones
// La app usa TypeOrmModule.forRootAsync() en app.module.ts
import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? '',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'auth_db',
  // synchronize: false — SIEMPRE
  synchronize: false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
});
