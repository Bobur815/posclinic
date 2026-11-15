import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { errorKey } from '../../common/errors';
import { LicenseService } from './license.service';
import { licenseTokenFrom, type ServerLicensePayload } from './license-verify';

/** What `LicenseGuard` puts on the request. */
export interface LicensedRequest {
  headers: Record<string, string | string[] | undefined>;
  clinicId?: string;
  license?: ServerLicensePayload;
}

const header = (req: LicensedRequest, name: string) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Till → server auth: `Authorization: License <posgro licence token>`. The clinic is the
 * licence's `storeId`, never anything from the body.
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(private readonly licenses: LicenseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<LicensedRequest>();
    const result = this.licenses.check(licenseTokenFrom(header(req, 'authorization')));
    if (!result.ok) {
      if (result.code === 'invalid_license') {
        throw new UnauthorizedException(errorKey('invalid_license'));
      }
      throw new ForbiddenException(errorKey(result.code));
    }
    await this.licenses.touch(
      result.license,
      header(req, 'x-terminal-id'),
      header(req, 'x-app-version'),
    );
    req.clinicId = result.license.storeId;
    req.license = result.license;
    return true;
  }
}
