import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CorsConfig } from './common/utils/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // ── CORS ──────────────────────────────────────────────────────────────────
  new CorsConfig(app).enable(process.env.CORS ?? 'http://localhost:5173,http://localhost:5174');

  // ── Global prefix & validation ─────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // biome-ignore lint/correctness/useHookAtTopLevel: NestJS method, not a React hook
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Swagger ────────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('POSCLINIC API')
    .setDescription(
      'Clinic Management POS System — REST API\n\n' +
        '**Auth:** Use `POST /api/auth/login` to get a Bearer token, then click **Authorize** above.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token (without "Bearer " prefix)',
      },
      'JWT',
    )
    .addTag('auth', 'Authentication & session management')
    .addTag('clinics', 'Clinic management (Super Admin)')
    .addTag('patients', 'Patient records')
    .addTag('doctors', 'Doctor management')
    .addTag('services', 'Medical services catalog')
    .addTag('appointments', 'Appointment scheduling & checkout')
    .addTag('sync', 'Terminal sync endpoints')
    .addServer('http://localhost:4000', 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'POSCLINIC API Docs',
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  app.enableShutdownHooks();

  // ── Start ──────────────────────────────────────────────────────────────────
  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');

  logger.log(`Server        → http://localhost:${port}/api`);
  logger.log(`Swagger docs  → http://localhost:${port}/api/docs`);
  logger.log(`Environment   → ${process.env.NODE_ENV ?? 'development'}`);
}

bootstrap();
