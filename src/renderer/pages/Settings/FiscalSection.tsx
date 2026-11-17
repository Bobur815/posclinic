import { Plug, Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { FiscalConfigDto, FiscalKindDto } from '../../../shared/clinic';
import { MxikField } from '../../components/form/MxikField';
import { useToast } from '../../context/ToastContext';
import { ipcErrorText } from '../../store/lan-store';

const KINDS: FiscalKindDto[] = ['CONSULTATION', 'ANALYSIS', 'PROCEDURE', 'DIRECT_SALE'];

/**
 * Settings → Fiscal receipt (v2.6, SavdoChef's fiscal-section): REGOS:VCR on this PC (or one in the
 * clinic network), its cashier login, VAT mode and the default MXIK per service kind (a service
 * with its own MXIK uses its own). Admins only; the main till talks to VCR. The password is never
 * shown back: leave it empty to keep the saved one.
 */
export function FiscalSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const [cfg, setCfg] = useState<FiscalConfigDto | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.fiscal
      .getConfig()
      .then(setCfg)
      .catch(() => setCfg(null));
  }, []);

  if (!cfg) return null;

  const save = async () => {
    setSaving(true);
    try {
      const next = await window.electronAPI.fiscal.setConfig({
        enabled: cfg.enabled,
        host: cfg.host.trim(),
        port: cfg.port,
        login: cfg.login.trim(),
        password: password || undefined,
        vatMode: cfg.vatMode,
        codes: cfg.codes,
      });
      setCfg(next);
      setPassword('');
      toast.success(t('common.success'));
    } catch (e) {
      toast.error(ipcErrorText(e, t));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setInfo(null);
    try {
      const r = await window.electronAPI.fiscal.test();
      setInfo(
        t('fiscal.testOk', {
          terminal: r.terminalId,
          version: r.appletVersion,
          z: r.freeZReports,
          unsent: r.freeUnsentReceipts,
        }),
      );
    } catch (e) {
      toast.error(ipcErrorText(e, t));
    } finally {
      setTesting(false);
    }
  };

  const codeOk = KINDS.every((k) => !cfg.codes[k].mxik || /^\d{17}$/.test(cfg.codes[k].mxik));

  return (
    <Section>
      <SectionTitle>
        <Receipt size={16} />
        {t('fiscal.title')}
      </SectionTitle>
      <Card>
        <Check>
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          />
          {t('fiscal.enabled')}
        </Check>
        <Hint>{t('fiscal.enabledHint')}</Hint>

        <Grid>
          <label>
            {t('fiscal.host')}
            <Input
              value={cfg.host}
              disabled={cfg.urlOverride}
              onChange={(e) => setCfg({ ...cfg, host: e.target.value })}
            />
          </label>
          <label>
            {t('fiscal.port')}
            <Input
              type="number"
              min={1}
              max={65535}
              value={cfg.port}
              disabled={cfg.urlOverride}
              onChange={(e) => setCfg({ ...cfg, port: parseInt(e.target.value, 10) || 0 })}
            />
          </label>
          <label>
            {t('fiscal.login')}
            <Input value={cfg.login} onChange={(e) => setCfg({ ...cfg, login: e.target.value })} />
          </label>
          <label>
            {t('fiscal.password')}
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              placeholder={cfg.hasPassword ? t('fiscal.passwordKept') : ''}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            {t('fiscal.vatMode')}
            <Select
              value={cfg.vatMode}
              onChange={(e) =>
                setCfg({ ...cfg, vatMode: e.target.value as FiscalConfigDto['vatMode'] })
              }
            >
              <option value="nonPayer">{t('fiscal.vat.nonPayer')}</option>
              <option value="vat12">{t('fiscal.vat.vat12')}</option>
            </Select>
          </label>
        </Grid>
        {cfg.urlOverride && <Hint>{t('fiscal.urlOverride')}</Hint>}

        <SubTitle>{t('fiscal.defaultCodes')}</SubTitle>
        <Hint style={{ marginLeft: 0 }}>{t('fiscal.defaultCodesHint')}</Hint>
        <Codes>
          {KINDS.map((k) => (
            <label key={k}>
              {t(`services.kinds.${k}`)}
              <MxikField
                value={cfg.codes[k]}
                onChange={(v) => setCfg({ ...cfg, codes: { ...cfg.codes, [k]: v } })}
              />
            </label>
          ))}
        </Codes>

        {info && <Ok>{info}</Ok>}
        <Buttons>
          <Btn onClick={save} disabled={saving || !codeOk}>
            {saving ? t('common.processing') : t('common.save')}
          </Btn>
          <Ghost onClick={test} disabled={testing || (!cfg.hasPassword && !password)}>
            <Plug size={14} />
            {testing ? t('common.processing') : t('fiscal.test')}
          </Ghost>
        </Buttons>
      </Card>
    </Section>
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
const SubTitle = styled.h3`
  font-size: 13px;
  margin: 16px 0 2px;
`;
const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 12px;
  label {
    display: grid;
    gap: 4px;
  }
`;
const Codes = styled.div`
  display: grid;
  gap: 12px;
  margin-top: 8px;
  label {
    display: grid;
    gap: 4px;
  }
`;
const Input = styled.input`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
`;
const Select = styled.select`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
`;
const Check = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
`;
const Hint = styled.p`
  margin: 4px 0 0 24px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const Ok = styled.p`
  margin: 12px 0 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.success};
`;
const Buttons = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 14px;
`;
const Btn = styled.button`
  padding: 8px 14px;
  border: 0;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
  }
`;
const Ghost = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
  }
`;
