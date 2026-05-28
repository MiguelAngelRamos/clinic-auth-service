// src/main.ts
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import basicAuth from "express-basic-auth";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);

  // Cabeceras HTTP de seguridad — OWASP A05:2021 Security Misconfiguration
  app.use(helmet());

  // cookie-parser — habilita req.cookies para leer la HttpOnly cookie del refresh
  app.use(cookieParser());

  // CORS restrictivo — solo el origen del frontend puede llamar con credentials
  // OWASP A01: Broken Access Control
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? [],
    methods: ["GET", "POST"],
    credentials: true,
  });

  // Prefijo global — versionado desde el inicio
  app.setGlobalPrefix("auth");

  // ValidationPipe global — valida todos los DTOs
  // whitelist: elimina campos no declarados en el DTO
  // forbidNonWhitelisted: rechaza con 400 si vienen campos extra
  // OWASP A03:2025 Injection
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger solo en development — OWASP A05:2021
  if (process.env.NODE_ENV === "development") {
    app.use(
      "/docs",
      basicAuth({
        users: {
          [process.env.SWAGGER_USER ?? "admin"]:
            process.env.SWAGGER_PASSWORD ?? "change-me",
        },
        challenge: true,
      }),
    );

    const config = new DocumentBuilder()
      .setTitle("clinic-auth-service")
      .setDescription(
        "Microservicio de autenticación — emite, rota y revoca tokens JWT.",
      )
      .setVersion("1.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        "access-token",
      )
      .build();

    SwaggerModule.setup(
      "docs",
      app,
      SwaggerModule.createDocument(app, config),
      {
        swaggerOptions: { persistAuthorization: true },
      },
    );
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`clinic-auth-service escuchando en :${port}`);
}

void bootstrap();
