import { ImagePlus, ReceiptText, Trash2 } from 'lucide-react';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import {
  buildSampleReceiptHTML,
  type PaperWidth,
  type ReceiptLayout,
  type ReceiptShowKey,
} from '../../../shared/receipt-html';
import { useToast } from '../../context/ToastContext';
import { useAuthStore } from '../../store/auth-store';
import { ipcErrorKey, useIsSatellite } from '../../store/lan-store';
import {
  ACCEPTED_LOGO_TYPES,
  prepareReceiptLogo,
  ReceiptLogoError,
} from '../../utils/receipt-logo';

type TextKey = 'clinicName' | 'address' | 'phone' | 'stir' | 'header' | 'footer';

/**
 * Settings → Receipt (after SavdoChef/posgro ReceiptSettings): what the clinic's receipt shows,
 * with a live preview. The layout is the clinic's (kept on the main till, used by every till);
 * the preview uses this PC's roll width. Everyone sees it; a clinic admin changes it.
 */
export function ReceiptSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const isSatellite = useIsSatellite();
  const isAdmin = useAuthStore(
    (s) => s.user?.role === 'CLINIC_ADMIN' || s.user?.role === 'SUPER_ADMIN',
  );
  const [layout, setLayout] = useState<ReceiptLayout | null>(null);
  const [width, setWidth] = useState<PaperWidth>('80');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.electronAPI.receipt
      .getLayout()
      .then(setLayout)
      .catch(() => setLayout(null));
    window.electronAPI.print
      .getConfig()
      .then((c) => setWidth(c.paperWidth))
      .catch(() => undefined);
  }, []);

  const preview = useMemo(
    () => (layout ? buildSampleReceiptHTML(layout, width) : ''),
    [layout, width],
  );

  if (!layout) return null;
  const set = (patch: Partial<ReceiptLayout>) => setLayout({ ...layout, ...patch });
  const text = (k: TextKey) => (e: ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      setLayout(await window.electronAPI.receipt.setLayout(layout));
      toast.success(t('settings.saved'));
    } catch (e) {
      toast.error(t(ipcErrorKey(e, 'common.error')));
    } finally {
      setSaving(false);
    }
  };

  const shows: Array<[ReceiptShowKey, string, string]> = [
    ['showClinicName', t('receiptSettings.showClinicName'), layout.clinicName],
    ['showAddress', t('receiptSettings.showAddress'), layout.address],
    ['showPhone', t('receiptSettings.showPhone'), layout.phone],
    ['showStir', t('receiptSettings.showStir'), layout.stir],
    ['showPatient', t('receiptSettings.showPatient'), ''],
    ['showDoctor', t('receiptSettings.showDoctor'), ''],
    ['showCashier', t('receiptSettings.showCashier'), ''],
    ['showPayments', t('receiptSettings.showPayments'), ''],
  ];

  return (
    <Section>
      <SectionTitle>
        <ReceiptText size={16} />
        {t('receiptSettings.title')}
      </SectionTitle>
      {isSatellite && <Hint>{t('receiptSettings.satelliteHint')}</Hint>}
      <Layout>
        <Card>
          <Grid>
            <label>
              {t('receiptSettings.language')}
              <Select
                value={layout.language}
                disabled={!isAdmin}
                onChange={(e) => set({ language: e.target.value as ReceiptLayout['language'] })}
              >
                <option value="uz">O&apos;zbek</option>
                <option value="ru">Русский</option>
              </Select>
            </label>
            <label>
              {t('receiptSettings.stir')}
              <Input
                value={layout.stir}
                onChange={text('stir')}
                disabled={!isAdmin}
                maxLength={20}
              />
            </label>
          </Grid>
          <label>
            {t('receiptSettings.clinicName')}
            <Input
              value={layout.clinicName}
              onChange={text('clinicName')}
              disabled={!isAdmin}
              maxLength={200}
            />
          </label>
          <label>
            {t('receiptSettings.address')}
            <Input
              value={layout.address}
              onChange={text('address')}
              disabled={!isAdmin}
              maxLength={200}
            />
          </label>
          <label>
            {t('receiptSettings.phone')}
            <Input
              value={layout.phone}
              onChange={text('phone')}
              disabled={!isAdmin}
              maxLength={30}
              placeholder="+998"
            />
          </label>
          <label>
            {t('receiptSettings.header')}
            <Input
              value={layout.header}
              onChange={text('header')}
              disabled={!isAdmin}
              maxLength={200}
            />
          </label>
          <label>
            {t('receiptSettings.footer')}
            <Input
              value={layout.footer}
              onChange={text('footer')}
              disabled={!isAdmin}
              maxLength={200}
              placeholder={t('receiptSettings.footerPlaceholder')}
            />
          </label>

          <LogoField
            label={t('receiptSettings.logoTop')}
            value={layout.logoTop}
            size={layout.logoTopSize}
            disabled={!isAdmin}
            onChange={(logoTop) => set({ logoTop })}
            onSize={(logoTopSize) => set({ logoTopSize })}
          />
          <LogoField
            label={t('receiptSettings.logoBottom')}
            value={layout.logoBottom}
            size={layout.logoBottomSize}
            disabled={!isAdmin}
            onChange={(logoBottom) => set({ logoBottom })}
            onSize={(logoBottomSize) => set({ logoBottomSize })}
          />

          <GroupTitle>{t('receiptSettings.showOnReceipt')}</GroupTitle>
          {shows.map(([key, label, value]) => (
            <CheckRow key={key}>
              <input
                type="checkbox"
                checked={layout[key]}
                disabled={!isAdmin}
                onChange={(e) => set({ [key]: e.target.checked })}
              />
              <span>{label}</span>
              {value && <ShowValue>— {value}</ShowValue>}
            </CheckRow>
          ))}

          {isAdmin && (
            <div>
              <Btn type="button" onClick={save} disabled={saving}>
                {saving ? t('common.processing') : t('common.save')}
              </Btn>
            </div>
          )}
        </Card>

        <Card>
          <GroupTitle>
            {t('receiptSettings.preview')} · {width} mm
          </GroupTitle>
          <PreviewBox>
            <PreviewFrame
              srcDoc={preview}
              sandbox=""
              width={width === '58' ? 220 : 305}
              height={560}
              title={t('receiptSettings.preview')}
            />
          </PreviewBox>
        </Card>
      </Layout>
    </Section>
  );
}

interface LogoFieldProps {
  label: string;
  value: string;
  size: number;
  disabled: boolean;
  onChange: (dataUrl: string) => void;
  onSize: (size: number) => void;
}

/** One receipt image (top or bottom): upload, preview, size, remove. */
function LogoField({ label, value, size, disabled, onChange, onSize }: LogoFieldProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same file again still fires onChange
    if (!file) return;
    try {
      onChange(await prepareReceiptLogo(file));
    } catch (err) {
      const reason = err instanceof ReceiptLogoError ? err.reason : 'decode';
      toast.error(t(`receiptSettings.logoError.${reason}`));
    }
  };

  return (
    <LogoBox>
      <GroupTitle>{label}</GroupTitle>
      {value ? (
        <>
          <LogoPreview>
            <img src={value} alt="" />
          </LogoPreview>
          <Row>
            <span>{t('receiptSettings.logoSize')}</span>
            <Select
              value={size}
              disabled={disabled}
              onChange={(e) => onSize(Number(e.target.value))}
            >
              {[30, 50, 70, 100].map((v) => (
                <option key={v} value={v}>
                  {v}%
                </option>
              ))}
            </Select>
          </Row>
          {!disabled && (
            <Row>
              <Btn type="button" $secondary onClick={() => input.current?.click()}>
                <ImagePlus size={14} />
                {t('receiptSettings.logoReplace')}
              </Btn>
              <Btn type="button" $danger onClick={() => onChange('')}>
                <Trash2 size={14} />
                {t('receiptSettings.logoRemove')}
              </Btn>
            </Row>
          )}
        </>
      ) : (
        <>
          {!disabled && (
            <div>
              <Btn type="button" $secondary onClick={() => input.current?.click()}>
                <ImagePlus size={14} />
                {t('receiptSettings.logoUpload')}
              </Btn>
            </div>
          )}
          <Hint>{t('receiptSettings.logoHint')}</Hint>
        </>
      )}
      <input ref={input} type="file" accept={ACCEPTED_LOGO_TYPES} hidden onChange={pick} />
    </LogoBox>
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
const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
  align-items: start;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;
const Card = styled.div`
  display: grid;
  gap: 12px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  label {
    display: grid;
    gap: 4px;
  }
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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
const GroupTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
`;
const CheckRow = styled.label`
  && {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  input {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
`;
const ShowValue = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;
const LogoBox = styled.div`
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
`;
const LogoPreview = styled.div`
  display: flex;
  justify-content: center;
  padding: 8px;
  background: #fff;
  border-radius: ${({ theme }) => theme.borderRadius};
  img {
    max-width: 100%;
    max-height: 120px;
    object-fit: contain;
  }
`;
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;
const Hint = styled.p`
  margin: 0 0 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const PreviewBox = styled.div`
  display: flex;
  justify-content: center;
  padding: 12px;
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: auto;
`;
const PreviewFrame = styled.iframe`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: #fff;
`;
const Btn = styled.button<{ $secondary?: boolean; $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid ${({ theme, $danger }) => ($danger ? theme.colors.error : theme.colors.primary)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme, $secondary, $danger }) =>
    $secondary || $danger ? 'transparent' : theme.colors.primary};
  color: ${({ theme, $secondary, $danger }) =>
    $danger ? theme.colors.error : $secondary ? theme.colors.primary : '#fff'};
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
  }
`;
