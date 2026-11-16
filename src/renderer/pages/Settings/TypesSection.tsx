import { Pencil, Plus, Save, Shapes, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import {
  SERVICE_KINDS,
  STAFF_ACCESS,
  type ServiceTypeInput,
  type StaffTypeInput,
} from '../../../shared/clinic';
import { useToast } from '../../context/ToastContext';
import { KIND_COLORS, useCustomTypes, useTypeName } from '../../hooks/useCustomTypes';
import { ipcErrorKey } from '../../store/lan-store';

/**
 * Settings → Types (clinic admins): the clinic's own order types (a name, a colour and how it
 * works) and staff types (a name and what it may do on the till). Types are switched off, never
 * deleted, so old orders and staff keep their names.
 */
export function TypesSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { serviceTypes, staffTypes, reload } = useCustomTypes();
  const name = useTypeName();
  const [svc, setSvc] = useState<ServiceTypeInput | null>(null);
  const [staff, setStaff] = useState<StaffTypeInput | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (fn: () => Promise<unknown>, done: () => void) => {
    setSaving(true);
    try {
      await fn();
      toast.success(t('common.success'));
      done();
      reload();
    } catch (e) {
      toast.error(t(ipcErrorKey(e, 'common.error')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section>
      <SectionTitle>
        <Shapes size={16} />
        {t('types.title')}
      </SectionTitle>

      <Card>
        <CardHead>
          <strong>{t('types.orderTypes')}</strong>
          <Btn
            onClick={() =>
              setSvc({
                nameUz: '',
                nameRu: '',
                behavior: 'DIRECT_SALE',
                color: KIND_COLORS.DIRECT_SALE,
                active: true,
              })
            }
          >
            <Plus size={14} />
            {t('types.add')}
          </Btn>
        </CardHead>
        <Muted>{t('types.orderTypesHint')}</Muted>
        {serviceTypes.length === 0 && !svc && <Muted>{t('types.none')}</Muted>}
        {serviceTypes.map((x) => (
          <Row key={x.id} $off={!x.active}>
            <Dot style={{ background: x.color ?? KIND_COLORS[x.behavior] }} />
            <span style={{ flex: 1 }}>
              {name(x)}
              <Muted>
                {t(`types.behaviors.${x.behavior}`)}
                {x.active ? '' : ` · ${t('common.inactive')}`}
              </Muted>
            </span>
            <IconBtn aria-label={t('common.edit')} onClick={() => setSvc({ ...x })}>
              <Pencil size={14} />
            </IconBtn>
          </Row>
        ))}
        {svc && (
          <Form>
            <label>
              {t('types.nameUz')}
              <Input
                value={svc.nameUz}
                onChange={(e) => setSvc({ ...svc, nameUz: e.target.value })}
              />
            </label>
            <label>
              {t('types.nameRu')}
              <Input
                value={svc.nameRu ?? ''}
                onChange={(e) => setSvc({ ...svc, nameRu: e.target.value })}
              />
            </label>
            <label>
              {t('types.behavior')}
              <Select
                value={svc.behavior}
                onChange={(e) =>
                  setSvc({ ...svc, behavior: e.target.value as ServiceTypeInput['behavior'] })
                }
              >
                {SERVICE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`types.behaviors.${k}`)}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              {t('types.color')}
              <Input
                type="color"
                value={svc.color ?? KIND_COLORS[svc.behavior]}
                onChange={(e) => setSvc({ ...svc, color: e.target.value })}
                style={{ padding: 2, height: 36 }}
              />
            </label>
            <Check>
              <input
                type="checkbox"
                checked={svc.active !== false}
                onChange={(e) => setSvc({ ...svc, active: e.target.checked })}
              />
              {t('common.active')}
            </Check>
            <Actions>
              <Btn onClick={() => setSvc(null)} aria-label={t('common.cancel')}>
                <X size={14} />
              </Btn>
              <Btn
                $primary
                disabled={saving || !svc.nameUz.trim()}
                onClick={() =>
                  save(
                    () => window.electronAPI.types.saveServiceType(svc),
                    () => setSvc(null),
                  )
                }
              >
                <Save size={14} />
                {t('common.save')}
              </Btn>
            </Actions>
          </Form>
        )}
      </Card>

      <Card>
        <CardHead>
          <strong>{t('types.staffTypes')}</strong>
          <Btn onClick={() => setStaff({ nameUz: '', nameRu: '', access: 'NONE', active: true })}>
            <Plus size={14} />
            {t('types.add')}
          </Btn>
        </CardHead>
        <Muted>{t('types.staffTypesHint')}</Muted>
        {staffTypes.length === 0 && !staff && <Muted>{t('types.none')}</Muted>}
        {staffTypes.map((x) => (
          <Row key={x.id} $off={!x.active}>
            <span style={{ flex: 1 }}>
              {name(x)}
              <Muted>
                {t(`types.access.${x.access}`)}
                {x.active ? '' : ` · ${t('common.inactive')}`}
              </Muted>
            </span>
            <IconBtn aria-label={t('common.edit')} onClick={() => setStaff({ ...x })}>
              <Pencil size={14} />
            </IconBtn>
          </Row>
        ))}
        {staff && (
          <Form>
            <label>
              {t('types.nameUz')}
              <Input
                value={staff.nameUz}
                onChange={(e) => setStaff({ ...staff, nameUz: e.target.value })}
              />
            </label>
            <label>
              {t('types.nameRu')}
              <Input
                value={staff.nameRu ?? ''}
                onChange={(e) => setStaff({ ...staff, nameRu: e.target.value })}
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              {t('types.accessLevel')}
              <Select
                value={staff.access}
                onChange={(e) =>
                  setStaff({ ...staff, access: e.target.value as StaffTypeInput['access'] })
                }
              >
                {STAFF_ACCESS.map((a) => (
                  <option key={a} value={a}>
                    {t(`types.access.${a}`)}
                  </option>
                ))}
              </Select>
            </label>
            <Check>
              <input
                type="checkbox"
                checked={staff.active !== false}
                onChange={(e) => setStaff({ ...staff, active: e.target.checked })}
              />
              {t('common.active')}
            </Check>
            <Actions>
              <Btn onClick={() => setStaff(null)} aria-label={t('common.cancel')}>
                <X size={14} />
              </Btn>
              <Btn
                $primary
                disabled={saving || !staff.nameUz.trim()}
                onClick={() =>
                  save(
                    () => window.electronAPI.types.saveStaffType(staff),
                    () => setStaff(null),
                  )
                }
              >
                <Save size={14} />
                {t('common.save')}
              </Btn>
            </Actions>
          </Form>
        )}
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
const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 16px;
  margin-bottom: 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;
const CardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;
const Muted = styled.span`
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const Row = styled.div<{ $off: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  opacity: ${({ $off }) => ($off ? 0.55 : 1)};
`;
const Dot = styled.span`
  width: 12px;
  height: 12px;
  border-radius: 999px;
  flex: none;
`;
const Form = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
  label {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;
const fieldCss = `
  width: 100%;
  padding: 8px 10px;
  font-size: 14px;
`;
const Input = styled.input`
  ${fieldCss}
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
`;
const Select = styled.select`
  ${fieldCss}
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
`;
const Check = styled.label`
  display: flex !important;
  align-items: center;
  gap: 8px;
  color: ${({ theme }) => theme.colors.text} !important;
`;
const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  align-self: end;
`;
const Btn = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid
    ${({ theme, $primary }) => ($primary ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $primary }) => ($primary ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $primary }) => ($primary ? '#fff' : theme.colors.text)};
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;
const IconBtn = styled.button`
  border: 0;
  background: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 4px;
`;
