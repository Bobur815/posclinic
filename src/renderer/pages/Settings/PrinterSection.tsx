import { Check, DoorOpen, FileText, Printer, RefreshCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { PrinterConfig } from '../../../shared/printing';
import { useToast } from '../../context/ToastContext';
import { usePrint } from '../../hooks/usePrint';
import { useAuthStore } from '../../store/auth-store';
import { ipcErrorKey } from '../../store/lan-store';

/**
 * Settings → Printer (after SavdoChef/posgro PrinterSettings): this PC's receipt printer and roll
 * width, an optional A4 printer for prescriptions, and the cash drawer. Saved on this computer
 * only (a satellite has its own printer). Everyone sees it; a clinic admin changes it.
 */
export function PrinterSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const print = usePrint();
  const isAdmin = useAuthStore(
    (s) => s.user?.role === 'CLINIC_ADMIN' || s.user?.role === 'SUPER_ADMIN',
  );
  const [printers, setPrinters] = useState<string[]>([]);
  const [cfg, setCfg] = useState<PrinterConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, config] = await Promise.all([
        window.electronAPI.print.listPrinters().catch(() => [] as string[]),
        window.electronAPI.print.getConfig(),
      ]);
      setPrinters(list);
      setCfg(config);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const save = async (patch: Partial<PrinterConfig>) => {
    try {
      setCfg(await window.electronAPI.print.setConfig(patch));
      toast.success(t('settings.saved'));
    } catch (e) {
      toast.error(t(ipcErrorKey(e, 'common.error')));
    }
  };

  const action = async (key: string, fn: () => Promise<boolean>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  if (!cfg) return loading ? <Muted>{t('common.loading')}</Muted> : null;

  /** The saved printer stays listed (as missing) when Windows no longer has it. */
  const options = (selected: string) =>
    selected && !printers.includes(selected) ? [selected, ...printers] : printers;
  const missing = (name: string) => !!name && !printers.includes(name);

  return (
    <>
      <Section>
        <SectionTitle>
          <Printer size={16} />
          {t('printing.receiptPrinter')}
          <IconBtn
            type="button"
            title={t('printing.refresh')}
            onClick={() => load()}
            disabled={loading}
          >
            <RefreshCcw size={14} />
          </IconBtn>
        </SectionTitle>
        <Card>
          <Hint>{t('printing.thisPcOnly')}</Hint>
          {printers.length === 0 && !loading && <Warn>{t('printing.noPrintersFound')}</Warn>}
          <List>
            {options(cfg.receiptPrinter).map((name) => (
              <Item
                key={name}
                type="button"
                $selected={name === cfg.receiptPrinter}
                disabled={!isAdmin}
                onClick={() => name !== cfg.receiptPrinter && save({ receiptPrinter: name })}
              >
                <span>
                  <Printer size={16} />
                  {name}
                  {missing(name) && <Missing>{t('printing.missing')}</Missing>}
                </span>
                {name === cfg.receiptPrinter && (
                  <Badge>
                    <Check size={12} />
                    {t('printing.selected')}
                  </Badge>
                )}
              </Item>
            ))}
          </List>

          <Row>
            <Label>{t('printing.paperWidth')}</Label>
            <Toggle>
              {(['80', '58'] as const).map((w) => (
                <ToggleBtn
                  key={w}
                  type="button"
                  $active={cfg.paperWidth === w}
                  disabled={!isAdmin}
                  onClick={() => cfg.paperWidth !== w && save({ paperWidth: w })}
                >
                  {w} mm
                </ToggleBtn>
              ))}
            </Toggle>
          </Row>
          <Hint>{t('printing.paperWidthHint')}</Hint>

          <Actions>
            <Btn
              type="button"
              disabled={!cfg.receiptPrinter || busy !== null}
              onClick={() =>
                action('receipt', () => print.run(window.electronAPI.print.test('receipt')))
              }
            >
              <Printer size={14} />
              {busy === 'receipt' ? t('common.processing') : t('printing.testPrint')}
            </Btn>
          </Actions>
        </Card>
      </Section>

      <Section>
        <SectionTitle>
          <FileText size={16} />
          {t('printing.documentPrinter')}
        </SectionTitle>
        <Card>
          <Hint>{t('printing.documentPrinterHint')}</Hint>
          <Select
            value={cfg.documentPrinter}
            disabled={!isAdmin}
            onChange={(e) => save({ documentPrinter: e.target.value })}
          >
            <option value="">{t('printing.useReceiptPrinter')}</option>
            {options(cfg.documentPrinter).map((name) => (
              <option key={name} value={name}>
                {name}
                {missing(name) ? ` (${t('printing.missing')})` : ''}
              </option>
            ))}
          </Select>
          <Actions>
            <Btn
              type="button"
              disabled={!(cfg.documentPrinter || cfg.receiptPrinter) || busy !== null}
              onClick={() =>
                action('document', () => print.run(window.electronAPI.print.test('document')))
              }
            >
              <FileText size={14} />
              {busy === 'document' ? t('common.processing') : t('printing.testPrint')}
            </Btn>
          </Actions>
        </Card>
      </Section>

      <Section>
        <SectionTitle>
          <DoorOpen size={16} />
          {t('printing.cashDrawer')}
        </SectionTitle>
        <Card>
          <CheckRow>
            <input
              type="checkbox"
              checked={cfg.cashDrawer}
              disabled={!isAdmin}
              onChange={(e) => save({ cashDrawer: e.target.checked })}
            />
            {t('printing.openDrawerOnCash')}
          </CheckRow>
          <Hint>{t('printing.cashDrawerHint')}</Hint>
          {isAdmin && (
            <Actions>
              <Btn
                type="button"
                $secondary
                disabled={!cfg.receiptPrinter || busy !== null}
                onClick={() =>
                  action('drawer', () =>
                    print.run(window.electronAPI.print.testDrawer(), 'printing.drawerOpened'),
                  )
                }
              >
                <DoorOpen size={14} />
                {busy === 'drawer' ? t('common.processing') : t('printing.openDrawer')}
              </Btn>
            </Actions>
          )}
        </Card>
      </Section>
    </>
  );
}

const Section = styled.section`
  margin-bottom: 24px;
`;
const SectionTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 10px;
`;
const Card = styled.div`
  display: grid;
  gap: 10px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;
const List = styled.div`
  display: grid;
  gap: 6px;
`;
const Item = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  text-align: left;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  border: 2px solid
    ${({ theme, $selected }) => ($selected ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  cursor: pointer;
  span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    cursor: default;
  }
`;
const Badge = styled.span`
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
`;
const Missing = styled.em`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
`;
const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;
const Label = styled.span`
  font-size: 14px;
  font-weight: 500;
`;
const Toggle = styled.div`
  display: flex;
  gap: 4px;
`;
const ToggleBtn = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  color: ${({ $active, theme }) => ($active ? '#fff' : theme.colors.text)};
  font-size: 13px;
  cursor: pointer;
`;
const Select = styled.select`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
`;
const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
`;
const Hint = styled.p`
  margin: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const Warn = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.warning};
`;
const Muted = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const Actions = styled.div`
  display: flex;
  gap: 8px;
`;
const Btn = styled.button<{ $secondary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme, $secondary }) => ($secondary ? 'transparent' : theme.colors.primary)};
  color: ${({ theme, $secondary }) => ($secondary ? theme.colors.primary : '#fff')};
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;
const IconBtn = styled.button`
  margin-left: auto;
  display: inline-flex;
  padding: 4px 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
`;
