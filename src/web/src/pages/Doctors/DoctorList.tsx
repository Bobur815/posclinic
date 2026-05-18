import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Stethoscope, RefreshCw, Plus, Pencil } from 'lucide-react';
import { doctors as doctorsApi, type DoctorRecord } from '../../api/client';

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

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.md}`};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${({ $variant, theme }) => $variant === 'primary' ? 'transparent' : theme.colors.border};
  background: ${({ $variant, theme }) => $variant === 'primary' ? theme.colors.primary : theme.colors.surface};
  color: ${({ $variant, theme }) => $variant === 'primary' ? '#fff' : theme.colors.text};

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

const ActiveBadge = styled.span<{ $active: boolean }>`
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

export function DoctorList() {
  const [data, setData] = useState<DoctorRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await doctorsApi.getAll()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Page>
      <Header>
        <Title><Stethoscope size={22} /> Врачи</Title>
        <Actions>
          <Btn onClick={load}><RefreshCw size={14} /></Btn>
          <Btn $variant="primary"><Plus size={14} /> Добавить врача</Btn>
        </Actions>
      </Header>

      {loading ? (
        <Empty>Загрузка...</Empty>
      ) : data.length === 0 ? (
        <Empty>Нет врачей</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>ФИО</Th>
              <Th>Специализация</Th>
              <Th>Телефон</Th>
              <Th>Лицензия</Th>
              <Th>Статус</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.id}>
                <Td>{d.fullName}</Td>
                <Td>{d.specialty ?? '—'}</Td>
                <Td>{d.phone ?? '—'}</Td>
                <Td>{d.licenseNo ?? '—'}</Td>
                <Td><ActiveBadge $active={d.active}>{d.active ? 'Активен' : 'Неактивен'}</ActiveBadge></Td>
                <Td><Btn><Pencil size={14} /></Btn></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Page>
  );
}
