import { Maximize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

const CHOICES: Array<'auto' | number> = ['auto', 0.9, 1, 1.1, 1.15, 1.25, 1.35, 1.5];

/**
 * This PC's screen scale (v2.6.1, main/ui-scale.ts): Auto follows the window (a Full HD monoblock
 * shows at about 115 %), or a fixed size. Saved on this PC only, for every user of it.
 */
export function UiScaleSetting() {
  const { t } = useTranslation();
  const [state, setState] = useState<{ choice: 'auto' | number; scale: number } | null>(null);

  useEffect(() => {
    window.electronAPI.app
      .getUiScale()
      .then(setState)
      .catch(() => setState(null));
  }, []);

  if (!state) return null;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const pick = async (choice: 'auto' | number) => {
    try {
      setState(await window.electronAPI.app.setUiScale(choice));
    } catch {
      // keeps the current scale
    }
  };

  return (
    <Row>
      <div>
        <Label>
          <Maximize2 size={14} /> {t('settings.uiScale')}
        </Label>
        <Desc>
          {state.choice === 'auto'
            ? t('settings.uiScaleAutoNow', { pct: pct(state.scale) })
            : t('settings.uiScaleDesc')}
        </Desc>
      </div>
      <Group>
        {CHOICES.map((c) => (
          <Btn
            key={String(c)}
            type="button"
            $active={state.choice === c}
            onClick={() => void pick(c)}
          >
            {c === 'auto' ? t('settings.uiScaleAuto') : pct(c)}
          </Btn>
        ))}
      </Group>
    </Row>
  );
}

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child {
    border-bottom: none;
  }
`;
const Label = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 2px;
`;
const Desc = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const Group = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;
const Btn = styled.button<{ $active: boolean }>`
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  color: ${({ $active, theme }) => ($active ? '#fff' : theme.colors.text)};
  font-size: 13px;
  cursor: pointer;
`;
