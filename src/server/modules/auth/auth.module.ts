import { Global, Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const DEV_SECRET = 'posclinic-dev-only-secret';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production')
    throw new Error('JWT_SECRET is required in production');
  new Logger('AuthModule').warn('JWT_SECRET not set: using the development secret');
  return DEV_SECRET;
}

/** Global so every dashboard controller can use `JwtAuthGuard`. */
@Global()
@Module({
  imports: [
    // Async: the factory runs after ConfigModule has loaded .env.
    JwtModule.registerAsync({
      useFactory: () => ({ secret: jwtSecret(), signOptions: { expiresIn: '12h' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
