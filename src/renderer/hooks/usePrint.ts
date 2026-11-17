import { useTranslation } from 'react-i18next';
import type { PrintResult } from '../../shared/printing';
import { useToast } from '../context/ToastContext';
import { ipcErrorKey, ipcErrorText } from '../store/lan-store';

/** A print call's `error`: an i18n key from main, or the driver's own words. */
export function printErrorText(error: string, t: (key: string) => string): string {
  if (/^(printing\.errors|errors|license\.feature)\.[A-Za-z_.-]+$/.test(error)) return t(error);
  return `${t('printing.errors.failed')}: ${error}`;
}

/**
 * Print buttons: runs a print call and toasts what happened. Licence refusals are toasted by
 * LicenseBanner already, so they are not repeated here.
 */
export function usePrint() {
  const { t } = useTranslation();
  const toast = useToast();

  const run = async (call: Promise<PrintResult>, okKey = 'printing.sent'): Promise<boolean> => {
    try {
      const result = await call;
      if (result.success) {
        toast.success(t(okKey));
        return true;
      }
      if (!result.error.startsWith('license.')) toast.error(printErrorText(result.error, t));
      return false;
    } catch (error) {
      if (!ipcErrorKey(error, '').startsWith('license.')) toast.error(ipcErrorText(error, t));
      return false;
    }
  };

  return {
    run,
    receipt: (appointmentId: string) => run(window.electronAPI.print.serviceReceipt(appointmentId)),
    prescription: (appointmentId: string) =>
      run(window.electronAPI.print.prescription(appointmentId)),
  };
}
