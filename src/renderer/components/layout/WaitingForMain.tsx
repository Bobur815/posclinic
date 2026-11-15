import { Loader2, LogOut, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled, { keyframes } from 'styled-components';
import { useToast } from '../../context/ToastContext';
import { followLan, ipcErrorKey, useLanStore } from '../../store/lan-store';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background}f2;
  padding: ${({ theme }) => theme.spacing.md};
`;

const Card = styled.div`
  width: 100%;
  max-width: 460px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
`;

const Icon = styled.div<{ $spin: boolean }>`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  svg {
    animation: ${({ $spin }) => ($spin ? spin : 'none')} 1s linear infinite;
  }
`;

const Title = styled.h2`
  font-size: 18px;
  margin: 0 0 8px;
`;

const Text = styled.p`
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 8px;
`;

const Btn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: ${({ theme }) => theme.spacing.md};
  padding: 8px 14px;
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

/** States in which the main till itself refuses this satellite: it may leave without a login. */
const STUCK = new Set(['unpaired', 'superseded', 'version']);

/**
 * Full screen on a satellite whose main till does not answer (or refuses it). The work on the
 * screen behind stays as it was; the line comes back by itself.
 */
export function WaitingForMain() {
  const { t } = useTranslation();
  const toast = useToast();
  const link = useLanStore((s) => s.link);
  const [version, setVersion] = useState('');
  const [leaving, setLeaving] = useState(false);
  // A satellite starting up connects within a moment: no flash of the overlay.
  const [grace, setGrace] = useState(true);

  useEffect(() => {
    followLan();
    void window.electronAPI.app.getVersion().then(setVersion);
    const timer = setTimeout(() => setGrace(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!link || link.role !== 'satellite' || link.state === 'online') return null;
  const state = link.state ?? 'connecting';
  if (state === 'connecting' && grace) return null;

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
    <Backdrop role="alertdialog" aria-live="polite">
      <Card>
        <Icon $spin={state === 'connecting' || state === 'unreachable'}>
          {state === 'connecting' || state === 'unreachable' ? (
            <Loader2 size={40} />
          ) : (
            <WifiOff size={40} />
          )}
        </Icon>
        <Title>{t('lan.waiting.title')}</Title>
        <Text>
          {t(`lan.waiting.${state}`, { main: link.mainVersion ?? '?', mine: version || '?' })}
        </Text>
        {link.mainUrl && <Text>{t('lan.waiting.address', { url: link.mainUrl })}</Text>}
        {STUCK.has(state) && (
          <Btn onClick={() => void leave()} disabled={leaving}>
            <LogOut size={14} />
            {t('lan.leave')}
          </Btn>
        )}
      </Card>
    </Backdrop>
  );
}
