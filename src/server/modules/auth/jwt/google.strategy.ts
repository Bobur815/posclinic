import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type VerifyCallback } from 'passport-google-oauth20';

export interface GoogleUser {
  googleId: string;
  email: string;
  firstName: string;
  lastName?: string;
  picture?: string;
  verified: boolean;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private static readonly logger = new Logger(GoogleStrategy.name);

  constructor() {
    const clientID = process.env.GOOGLE_CLIENT_ID ?? 'placeholder';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? 'placeholder';
    const callbackURL =
      process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/api/auth/google/callback';

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      GoogleStrategy.logger.warn(
        'Google OAuth is not configured — GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing',
      );
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    // biome-ignore lint/suspicious/noExplicitAny: passport-google-oauth20 profile shape
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    const { id, name, emails, photos, _json } = profile;

    const user: GoogleUser = {
      googleId: id,
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos[0]?.value,
      verified: _json.email_verified || false,
    };

    done(null, user);
  }
}
