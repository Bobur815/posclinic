/**
 * Runtime config of the running clinic, filled from the clinic DB's `local_config` row at launch.
 * Nothing secret lives here: the till has no server credentials (licensing: license-service.ts).
 */
interface AppConfig {
  clinicId: string;
  clinicName: string;
  terminalId: string;
  debug: boolean;
}

let config: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (!config) {
    config = {
      clinicId: '',
      clinicName: 'POSCLINIC',
      terminalId: '',
      debug: process.env.NODE_ENV === 'development',
    };
  }
  return config;
}

export function updateConfig(updates: Partial<AppConfig>): void {
  config = { ...getAppConfig(), ...updates };
}
