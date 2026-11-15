import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useToast } from '../../context/ToastContext';
import { useLicenseStore } from '../../store/license-store';
import { followLan, ipcErrorKey, useLanStore } from '../../store/lan-store';
import { useTheme } from '../../theme/ThemeProvider';
import { LogoMark } from '../brand/Logo';
import { tillTokens } from '../brand/till-tokens';
import {
  BigSpinner,
  BrandWord,
  Cell,
  type Conn,
  Dot,
  Grid,
  IconLogout,
  IconMoon,
  IconSun,
  MarkWrap,
  Ring,
  Seg,
  ThemeBtn,
  Title,
  Version,
} from '../brand/till-ui';

/** States in which the main till itself refuses this satellite: it may leave without a login. */
const STUCK = new Set(['unpaired', 'superseded', 'version']);

/**
 * Full screen on a satellite whose main till does not answer (or refuses it). Design: "POSCLINIC
 * — Login - desktop", waiting state. The work on the screen behind stays as it was; the line
 * comes back by itself (main-link retries after 1, 2, 5, 10 s), so there is no "connect now"
 * button: nothing on this side could make it faster.
 */
export function WaitingForMain() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { mode, toggleTheme } = useTheme();
  const link = useLanStore((s) => s.link);
  const clinicName = useLicenseStore((s) => s.status?.storeName) ?? link?.clinicName ?? '';
  const [version, setVersion] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [now, setNow] = useState(Date.now());
  // A satellite starting up connects within a moment: no flash of the overlay.
  const [grace, setGrace] = useState(true);

  useEffect(() => {
    followLan();
    void window.electronAPI.app.getVersion().then(setVersion);
    const timer = setTimeout(() => setGrace(false), 1500);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  if (!link || link.role !== 'satellite' || link.state === 'online') return null;
  const state = link.state ?? 'connecting';
  if (state === 'connecting' && grace) return null;

  const stuck = STUCK.has(state);
  const dot: Conn = state === 'connecting' ? 'connecting' : 'offline';
  const d = new Date(now);
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const mainHost = link.mainUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const leave = async () => {
    if (!window.confirm(t('lan.leaveConfirm'))) return;
    setLeaving(true);
    try {
      await window.electronAPI.lan.leave();
    } catch (e) {
      toast.error(t(ipcErrorKey(e)));
      setLeaving(false);
    }
  };

  return (
    <Overlay
      $dark={mode === 'dark'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="waiting-title"
      aria-describedby="waiting-body"
      lang={i18n.language}
    >
      <Grid aria-hidden="true" />
      <Ring aria-hidden="true" style={{ width: 760, height: 760, left: -260, bottom: -380 }} />
      <Ring $dash aria-hidden="true" style={{ width: 520, height: 520, right: -180, top: -220 }} />
      <Cell aria-hidden="true" style={{ width: 52, height: 52, right: 160, bottom: 140 }} />
      <Cell aria-hidden="true" style={{ width: 28, height: 28, left: 220, top: 170 }} />

      <Top>
        <MarkWrap style={{ borderRadius: 10 }}>
          <LogoMark size={44} />
        </MarkWrap>
        <BrandWord style={{ fontSize: 22 }}>posclinic</BrandWord>
        {clinicName && (
          <>
            <Divider aria-hidden="true" />
            <strong style={{ fontSize: 17 }}>{clinicName}</strong>
          </>
        )}
        <ClockSmall>{clock}</ClockSmall>
      </Top>

      <Mid>
        <Card>
          <BigSpinner aria-hidden="true" />
          <Title id="waiting-title" style={{ marginTop: 8 }}>
            {t('lan.waiting.title')}
          </Title>
          <Body id="waiting-body">
            {t(`lan.waiting.${state}`, { main: link.mainVersion ?? '?', mine: version || '?' })}
          </Body>
          {mainHost && (
            <AddrBlock>
              <AddrLabel>{t('login.mainAddress')}</AddrLabel>
              <Addr>
                <Dot
                  $conn={dot}
                  aria-hidden="true"
                  style={{ boxShadow: '0 0 0 2px var(--pc-surface)' }}
                />
                {mainHost}
              </Addr>
            </AddrBlock>
          )}
          <Status role="status" aria-live="polite">
            {stuck ? t('login.mainRefused') : t('login.reconnecting')}
          </Status>
          {stuck && (
            <LeaveBtn type="button" onClick={() => void leave()} disabled={leaving}>
              <IconLogout />
              {t('lan.leave')}
            </LeaveBtn>
          )}
        </Card>
      </Mid>

      <BottomBar>
        <Seg role="group" aria-label={t('login.langGroup')}>
          {(['uz', 'ru'] as const).map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={i18n.language === l}
              onClick={() => {
                void i18n.changeLanguage(l);
                try {
                  localStorage.setItem('language', l);
                } catch {
                  /* not remembered */
                }
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </Seg>
        <ThemeBtn
          type="button"
          onClick={toggleTheme}
          aria-label={mode === 'dark' ? t('login.toLight') : t('login.toDark')}
        >
          {mode === 'dark' ? <IconSun /> : <IconMoon />}
        </ThemeBtn>
        <Version style={{ color: '#ffffff' }}>{version ? `v${version}` : ''}</Version>
      </BottomBar>
    </Overlay>
  );
}

const Overlay = styled.div<{ $dark: boolean }>`
  ${({ $dark }) => tillTokens($dark)}
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--pc-gradient-brand);
  color: #ffffff;
  button:focus-visible {
    outline-color: #ffffff;
  }
`;

const Top = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 28px 40px;
`;
const Divider = styled.span`
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.4);
  margin: 0 4px;
`;
const ClockSmall = styled.span`
  margin-left: auto;
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`;
const Mid = styled.div`
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
`;
const Card = styled.div`
  width: 560px;
  max-width: 100%;
  background: var(--pc-surface);
  color: var(--pc-text);
  border-radius: var(--pc-radius-xl);
  box-shadow: var(--pc-shadow-card);
  padding: 40px 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  button:focus-visible {
    outline-color: var(--pc-focus);
  }
`;
const Body = styled.p`
  margin: 0;
  max-width: 440px;
  font-size: 16px;
  color: var(--pc-text-muted);
`;
const AddrBlock = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
`;
const AddrLabel = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: var(--pc-text-muted);
`;
const Addr = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: var(--pc-radius-md);
  background: var(--pc-surface-2);
  border: 1px solid var(--pc-border);
  font-family: var(--pc-mono);
  font-size: 18px;
  font-weight: 600;
  color: var(--pc-text);
`;
const Status = styled.p`
  margin: 4px 0 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--pc-text);
`;
const LeaveBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: var(--pc-control-h);
  margin-top: 4px;
  border: 1.5px solid var(--pc-danger-border);
  border-radius: var(--pc-radius-md);
  background: var(--pc-danger-bg);
  color: var(--pc-danger-text);
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
const BottomBar = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 40px;
`;
