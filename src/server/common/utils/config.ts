// CORS konfiguratsiyasi uchun yordamchi klass
import { type INestApplication, Logger } from '@nestjs/common';

export class CorsConfig {
  private readonly logger = new Logger(CorsConfig.name);

  constructor(private readonly app: INestApplication) {}

  public enable(envCors: string | undefined) {
    if (!envCors || envCors.trim() === '') {
      this.app.enableCors({ origin: false });
      this.logger.warn('⚠️ CORS disabled (no envCors provided)');
      return;
    }

    // 1️⃣ Development holati: CORS=*
    if (envCors === '*') {
      this.app.enableCors({
        origin: true, // browserga kelgan originni avtomatik qaytaradi
        credentials: true, // credentials enabled for development
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      });
      this.logger.log('🌍 CORS enabled for all origins (*) [WITH CREDENTIALS]');
      return;
    }

    // 2️⃣ Production holati: whitelist orqali
    // Normalize entries: strip scheme so "http://localhost:5173" → "localhost:5173"
    const whiteList = envCors.split(',').map((d) => {
      const trimmed = d.trim().toLowerCase();
      try {
        if (trimmed.includes('://')) {
          const u = new URL(trimmed);
          return `${u.hostname}${u.port ? `:${u.port}` : ''}`;
        }
      } catch {
        /* leave as-is */
      }
      return trimmed;
    });

    this.app.enableCors({
      origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return cb(null, true); // Swagger/Postman/mobile

        try {
          const u = new URL(origin);
          const hostname = u.hostname.toLowerCase();
          const host = `${hostname}${u.port ? `:${u.port}` : ''}`;

          // Allow any localhost / 127.0.0.1 origin regardless of port
          if (hostname === 'localhost' || hostname === '127.0.0.1') return cb(null, true);

          // domen ro'yxati (port yo'q bo'lsa ham ishlaydi)
          const allowed = whiteList.some((d) => {
            // d: yettibuloq-shifo.uz yoki www.yettibuloq-shifo.uz yoki api.yettibuloq-shifo.uz yoki host:port
            if (d.includes(':')) return d === host; // host:port mosligi
            return host === d; // aynan host mosligi
          });

          return allowed ? cb(null, true) : cb(new Error('Not allowed by CORS'));
        } catch {
          return cb(new Error('Invalid Origin'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
      // 'Access-Control-Request-*' headerlarini allowedHeaders'ga qo‘shish shart emas
      // 'Set-Cookie'ni expose qilish ham shart emas (JS orqali o‘qilmaydi baribir)
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });

    this.logger.log(`✅ CORS enabled for whitelist: ${whiteList.join(' | ')} + localhost`);
  }
}
