/** Server error codes; the `message` of every HttpException is the i18n key `server.errors.<code>`. */
export type ServerErrorCode =
  | 'invalid_license'
  | 'license_blocked'
  | 'license_checkin_required'
  | 'invalid_credentials'
  | 'not_admin'
  | 'user_inactive'
  | 'unauthorized'
  | 'not_found'
  | 'phone_invalid'
  | 'phone_taken'
  | 'code_taken'
  | 'role_invalid'
  | 'self_demote'
  | 'wrong_password'
  | 'batch_too_large'
  | 'invalid_date';

export const errorKey = (code: ServerErrorCode) => `server.errors.${code}`;
