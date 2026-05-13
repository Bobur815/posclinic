interface AppConfig {
  clinicId: string;
  clinicName: string;
  terminalId: string;
  vpsApiUrl: string;
  syncIntervalMs: number;
  jwtSecret: string;
  debug: boolean;
}

let config: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

function loadConfig(): AppConfig {
  return {
    clinicId: process.env.CLINIC_ID || '',
    clinicName: process.env.CLINIC_NAME || 'POSCLINIC',
    terminalId: process.env.TERMINAL_ID || 'TERMINAL_001',
    vpsApiUrl: process.env.VPS_API_URL || 'https://posclinic.bobur-dev.uz/api',
    syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '60000', 10),
    jwtSecret: process.env.JWT_SECRET || 'local-development-secret-key-32chars',
    debug: process.env.NODE_ENV === 'development',
  };
}

export function updateConfig(updates: Partial<AppConfig>): void {
  config = {
    ...getAppConfig(),
    ...updates,
  };
}

export function resetConfig(): void {
  config = null;
}

export function validateEnvironment(): string[] {
  const errors: string[] = [];

  if (!process.env.TERMINAL_ID) {
    errors.push('TERMINAL_ID is not set');
  }

  if (!process.env.VPS_API_URL) {
    errors.push('VPS_API_URL is not set (using default)');
  }

  return errors;
}
