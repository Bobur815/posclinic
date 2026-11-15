import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

/**
 * The login page's saved password (Settings → Clinic → "save password on the login page", with
 * "Remember me" ticked). One login per machine: the remembered phone and its password, encrypted
 * with this OS user's key (Electron safeStorage: DPAPI on Windows). It never leaves this PC: the
 * `credentials:` channels are local-only (lan/server.ts LOCAL_ONLY), never forwarded to the main
 * till. Without OS encryption nothing is saved (a password is never written in plain text).
 */

export interface SecretCipher {
  available(): boolean;
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

interface Saved {
  phone: string;
  secret: string;
}

export class CredentialStore {
  constructor(
    private readonly file: string,
    private readonly cipher: SecretCipher,
  ) {}

  private read(): Saved | null {
    try {
      if (!existsSync(this.file)) return null;
      const v = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Saved>;
      return typeof v.phone === 'string' && typeof v.secret === 'string'
        ? { phone: v.phone, secret: v.secret }
        : null;
    } catch {
      return null;
    }
  }

  /** The saved password for this phone, or null (another phone, nothing saved, unreadable). */
  get(phone: string): string | null {
    const s = this.read();
    if (!s || s.phone !== phone || !this.cipher.available()) return null;
    try {
      return this.cipher.decrypt(s.secret);
    } catch {
      return null;
    }
  }

  /** Saves (replacing any other); false when this machine cannot encrypt it. */
  save(phone: string, password: string): boolean {
    if (!this.cipher.available() || !phone || !password || password.length > 128) return false;
    writeFileSync(this.file, JSON.stringify({ phone, secret: this.cipher.encrypt(password) }), {
      encoding: 'utf8',
      mode: 0o600,
    });
    return true;
  }

  clear(): void {
    try {
      rmSync(this.file, { force: true });
    } catch {
      /* already gone */
    }
  }
}
