import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CorsConfig } from './common/utils/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug'],
  });
  // Sync batches: 200 appointments with items fit well within this.
  // biome-ignore lint/correctness/useHookAtTopLevel: NestJS method, not a React hook
  app.useBodyParser('json', { limit: '5mb' });

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
      'posclinic cloud server\n\n' +
        '**Dashboard:** `POST /api/auth/login` (phone + password) gives a Bearer token.\n' +
        '**Sync:** the main till sends `Authorization: License <posgro licence token>`.',
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
    .addSecurity('License', {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Main till sync: `License <posgro licence token>`',
    })
    .addTag('sync', 'Main till sync (licence auth)')
    .addTag('auth', 'Dashboard login (clinic admins)')
    .addTag('clinic', 'This clinic and its tills')
    .addTag('dashboard', 'Daily summary')
    .addTag('patients', 'Patients (read-only)')
    .addTag('appointments', 'Visits (read-only)')
    .addTag('reports', 'Daily / monthly reports')
    .addTag('services', 'Services catalog')
    .addTag('doctors', 'Doctors')
    .addTag('users', 'Staff')
    .addTag('audit', 'Audit log')
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
