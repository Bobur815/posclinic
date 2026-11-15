import { Copy, KeyRound, LogOut, MonitorSmartphone, Network, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { LanStatusDto } from '../../../shared/lan';
import { useToast } from '../../context/ToastContext';
import { followLan, ipcErrorKey, useLanStore } from '../../store/lan-store';

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
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 6px 0;
`;

const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Desc = styled.p`
  margin: 0 0 8px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.5;
`;

const ErrorText = styled.div`
  margin: 6px 0;
  color: ${({ theme }) => theme.colors.error};
`;

const Dot = styled.span<{ $on: boolean }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  background: ${({ $on, theme }) => ($on ? theme.colors.success : theme.colors.border)};
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  cursor: pointer;
  border: 1px solid
    ${({ $variant, theme }) =>
      $variant === 'danger'
        ? theme.colors.error
        : $variant === 'ghost'
          ? theme.colors.border
          : theme.colors.primary};
  background: ${({ $variant, theme }) =>
    $variant === 'primary' || !$variant ? theme.colors.primary : 'transparent'};
  color: ${({ $variant, theme }) =>
    $variant === 'danger' ? theme.colors.error : $variant === 'ghost' ? theme.colors.text : '#fff'};
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const PortInput = styled.input`
  width: 90px;
  padding: 6px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
`;

const Code = styled.div`
  font-family: monospace;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: ${({ theme }) => theme.colors.primary};
`;

const CodeBox = styled.div`
  margin: 10px 0;
  padding: 12px;
  border: 1px dashed ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius};
  text-align: center;
`;

const Device = styled.div<{ $active: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  opacity: ${({ $active }) => ($active ? 1 : 0.55)};
`;

const Pre = styled.pre`
  margin: 6px 0 0;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 11px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.text};
`;

const Toggle = styled.input`
  width: 18px;
  height: 18px;
  accent-color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
`;

function useCountdown(expiresAt: string | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return '';
  const left = Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

const firewallCommand = (port: number) =>
  `New-NetFirewallRule -DisplayName "POSCLINIC LAN" -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow -Profile Private -RemoteAddress LocalSubnet`;

/** Settings → Satellite tills on the main till (admins). */
function MainLanSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const [status, setStatus] = useState<LanStatusDto | null>(null);
  const [port, setPort] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await window.electronAPI.lan.status();
      setStatus(s);
      setPort((p) => p || String(s.port));
    } catch {
      /* not an admin, or the till is a satellite */
    }
  }, []);

  useEffect(() => {
    void load();
    return window.electronAPI.lan.onChanged(() => void load());
  }, [load]);

  const run = async (action: () => Promise<LanStatusDto>) => {
    setBusy(true);
    try {
      setStatus(await action());
    } catch (e) {
      toast.error(t(ipcErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const countdown = useCountdown(status?.pairing?.expiresAt ?? null);
  // The code expired here: re-read (the main till closes the door with it).
  useEffect(() => {
    if (status?.pairing && countdown === '0:00') void load();
  }, [countdown, status?.pairing, load]);

  if (!status) return null;
  const active = status.devices.filter((d) => d.active).length;
  const atLimit = status.deviceLimit !== null && active >= status.deviceLimit;

  const copyFirewall = async () => {
    try {
      await navigator.clipboard.writeText(firewallCommand(status.port));
      toast.success(t('lan.copied'));
    } catch {
      /* clipboard refused */
    }
  };

  return (
    <Section>
      <SectionTitle>
        <Network size={15} />
        {t('lan.title')}
      </SectionTitle>
      <Card>
        <Desc>{t('lan.description')}</Desc>
        <Row>
          <span>{t('lan.enabled')}</span>
          <Toggle
            type="checkbox"
            checked={status.enabled}
            disabled={busy}
            onChange={(e) =>
              void run(() => window.electronAPI.lan.update({ enabled: e.target.checked }))
            }
          />
        </Row>
        <Row>
          <Muted>{t('lan.port')}</Muted>
          <span style={{ display: 'flex', gap: 8 }}>
            <PortInput
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
            />
            <Btn
              $variant="ghost"
              disabled={busy || Number(port) === status.port}
              onClick={() => void run(() => window.electronAPI.lan.update({ port: Number(port) }))}
            >
              {t('lan.save')}
            </Btn>
          </span>
        </Row>
        <Row>
          <Muted>
            <Dot $on={status.serving} />
            {status.serving ? t('lan.serving') : t('lan.notServing')}
          </Muted>
          <span>
            {status.deviceLimit === null
              ? t('lan.unlimited')
              : t('lan.limit', { used: active, limit: status.deviceLimit })}
          </span>
        </Row>
        {status.error && <ErrorText>{t(status.error)}</ErrorText>}
        <Row>
          <Muted>{t('lan.addresses')}</Muted>
          <span>
            {status.addresses.length
              ? status.addresses.map((a) => `${a}:${status.port}`).join(', ')
              : t('lan.noAddresses')}
          </span>
        </Row>

        {status.pairing ? (
          <CodeBox>
            <Code>{status.pairing.code}</Code>
            <Muted>{t('lan.codeHint', { time: countdown })}</Muted>
            <div style={{ marginTop: 8 }}>
              <Btn
                $variant="ghost"
                disabled={busy}
                onClick={() => void run(() => window.electronAPI.lan.cancelCode())}
              >
                <X size={14} />
                {t('lan.cancelCode')}
              </Btn>
            </div>
          </CodeBox>
        ) : (
          <Row>
            <span />
            <Btn
              disabled={busy || !status.enabled || atLimit}
              onClick={() => void run(() => window.electronAPI.lan.issueCode())}
            >
              <KeyRound size={14} />
              {t('lan.issueCode')}
            </Btn>
          </Row>
        )}

        <div style={{ marginTop: 10, fontWeight: 600 }}>{t('lan.devices')}</div>
        {status.devices.length === 0 && <Muted>{t('lan.noDevices')}</Muted>}
        {status.devices.map((d) => (
          <Device key={d.id} $active={d.active}>
            <span>
              <MonitorSmartphone size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              {d.name}
              {d.ip ? ` · ${d.ip}` : ''}
              {!d.active && ` · ${t('lan.revoked')}`}
              <br />
              <Muted>
                {t('lan.lastSeen')}:{' '}
                {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : t('lan.never')}
              </Muted>
            </span>
            {d.active && (
              <Btn
                $variant="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t('lan.revokeConfirm', { name: d.name }))) {
                    void run(() => window.electronAPI.lan.revoke(d.id));
                  }
                }}
              >
                <Trash2 size={14} />
                {t('lan.revoke')}
              </Btn>
            )}
          </Device>
        ))}

        <div style={{ marginTop: 12 }}>
          <Muted>{t('lan.firewall')}</Muted>
          <Pre>{firewallCommand(status.port)}</Pre>
          <Btn $variant="ghost" style={{ marginTop: 6 }} onClick={() => void copyFirewall()}>
            <Copy size={14} />
            {t('lan.copy')}
          </Btn>
        </div>
      </Card>
    </Section>
  );
}

/** Settings on a satellite: its main till and the way out. */
function SatelliteLinkSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const link = useLanStore((s) => s.link);
  const [busy, setBusy] = useState(false);
  if (!link) return null;

  const leave = async () => {
    if (!window.confirm(t('lan.leaveConfirm'))) return;
    setBusy(true);
    try {
      await window.electronAPI.lan.leave();
    } catch (e) {
      toast.error(t(ipcErrorKey(e)));
      setBusy(false);
    }
  };

  return (
    <Section>
      <SectionTitle>
        <Network size={15} />
        {t('lan.linkTitle')}
      </SectionTitle>
      <Card>
        <Desc>{t('lan.linkDescription')}</Desc>
        <Row>
          <Muted>{t('lan.mainAddress')}</Muted>
          <span>{link.mainUrl ?? '—'}</span>
        </Row>
        {link.clinicName && (
          <Row>
            <Muted>{t('lan.clinic')}</Muted>
            <span>{link.clinicName}</span>
          </Row>
        )}
        <Row>
          <Muted>
            <Dot $on={link.state === 'online'} />
            {t(`lan.state.${link.state ?? 'connecting'}`)}
          </Muted>
          <span>
            {t('lan.mainVersion')}: {link.mainVersion ?? '—'}
          </span>
        </Row>
        <Row>
          <span />
          <Btn $variant="danger" disabled={busy} onClick={() => void leave()}>
            <LogOut size={14} />
            {t('lan.leave')}
          </Btn>
        </Row>
      </Card>
    </Section>
  );
}

export function LanSection() {
  const link = useLanStore((s) => s.link);
  useEffect(() => followLan(), []);
  if (!link) return null;
  return link.role === 'satellite' ? <SatelliteLinkSection /> : <MainLanSection />;
}
