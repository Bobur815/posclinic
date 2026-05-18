import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailService } from '../../common/services/mail.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './jwt/google.strategy';
import { JwtStrategy } from './jwt/jwt.strategy';
import { JwtAuthGuard } from './jwt/jwt-auth.guard';
import { RolesGuard } from './roles/roles.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'posclinic-secret-key'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_EXPIRATION', '7d') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard, EmailService, GoogleStrategy],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
