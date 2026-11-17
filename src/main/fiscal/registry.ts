import type { FiscalService } from './fiscal-service';

/**
 * The main till's FiscalService (index.ts). Null on a satellite (its calls go to the main till)
 * and in tests that do not set one: handlers then answer as "fiscal receipts off".
 */
let service: FiscalService | null = null;

export function setFiscalService(next: FiscalService | null): void {
  service = next;
}

export function getFiscalService(): FiscalService | null {
  return service;
}
