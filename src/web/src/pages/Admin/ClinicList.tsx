import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Building2, RefreshCw, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { clinics as clinicsApi, type ClinicRecord } from '../../api/client';

const Page = styled.div``;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  font-size: 1.4rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Actions = styled.div`display: flex; gap: ${({ theme }) => theme.spacing.sm};`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.md}`};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${({ $variant, theme }) =>
    $variant === 'primary' ? 'transparent' :
    $variant === 'danger' ? theme.colors.error :
    theme.colors.border};
  background: ${({ $variant, theme }) =>
    $variant === 'primary' ? theme.colors.primary :
    $variant === 'danger' ? theme.colors.error + '10' :
    theme.colors.surface};
  color: ${({ $variant, theme }) =>
    $variant === 'primary' ? '#fff' :
    $variant === 'danger' ? theme.colors.error :
    theme.colors.text};
  &:hover { opacity: 0.85; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow: hidden;
`;

const Th = styled.th`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  text-align: left;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Badge = styled.span<{ $active: boolean }>`
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  background: ${({ $active, theme }) => $active ? theme.colors.success + '20' : theme.colors.error + '20'};
  color: ${({ $active, theme }) => $active ? theme.colors.success : theme.colors.error};
`;

const Empty = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CLINIC_TYPES: Record<string, string> = {
  GENERAL: 'Общая',
  DENTAL: 'Стоматология',
  OPHTHALMOLOGY: 'Офтальмология',
  PEDIATRIC: 'Педиатрия',
  ORTHOPEDIC: 'Ортопедия',
  DERMATOLOGY: 'Дерматология',
  CARDIOLOGY: 'Кардиология',
  NEUROLOGY: 'Неврология',
  OTHER: 'Другое',
};

export function ClinicList() {
  const [data, setData] = useState<ClinicRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await clinicsApi.getAll()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (clinic: ClinicRecord) => {
    try {
      if (clinic.active) await clinicsApi.deactivate(clinic.id);
      else await clinicsApi.activate(clinic.id);
      await load();
    } catch { /* ignore */ }
  };

  return (
    <Page>
      <Header>
        <Title><Building2 size={22} /> Клиники</Title>
        <Actions>
          <Btn onClick={load}><RefreshCw size={14} /></Btn>
          <Btn $variant="primary"><Plus size={14} /> Добавить клинику</Btn>
        </Actions>
      </Header>

      {loading ? <Empty>Загрузка...</Empty> : data.length === 0 ? <Empty>Нет клиник</Empty> : (
        <Table>
          <thead>
            <tr>
              <Th>Название</Th>
              <Th>Тип</Th>
              <Th>Телефон</Th>
              <Th>Лицензия</Th>
              <Th>Пользователи</Th>
              <Th>Статус</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <Td>{c.name}</Td>
                <Td>{CLINIC_TYPES[c.type] ?? c.type}</Td>
                <Td>{c.phone ?? '—'}</Td>
                <Td>{c.licenseNo ?? '—'}</Td>
                <Td>{c._count?.users ?? '—'}</Td>
                <Td><Badge $active={c.active}>{c.active ? 'Активна' : 'Неактивна'}</Badge></Td>
                <Td>
                  <Btn onClick={() => toggle(c)} title={c.active ? 'Деактивировать' : 'Активировать'}>
                    {c.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Page>
  );
}
