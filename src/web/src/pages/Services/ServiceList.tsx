import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Layers, RefreshCw, Plus, Pencil } from 'lucide-react';
import { services as servicesApi, type ServiceRecord } from '../../api/client';

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

const Btn = styled.button<{ $variant?: 'primary' }>`
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

const Empty = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function ServiceList() {
  const [data, setData] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await servicesApi.getAll()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Page>
      <Header>
        <Title><Layers size={22} /> Услуги</Title>
        <Actions>
          <Btn onClick={load}><RefreshCw size={14} /></Btn>
          <Btn $variant="primary"><Plus size={14} /> Добавить услугу</Btn>
        </Actions>
      </Header>

      {loading ? <Empty>Загрузка...</Empty> : data.length === 0 ? <Empty>Нет услуг</Empty> : (
        <Table>
          <thead>
            <tr>
              <Th>Код</Th>
              <Th>Название</Th>
              <Th>Описание</Th>
              <Th>Цена</Th>
              <Th>Длительность</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <Td>{s.code}</Td>
                <Td>{s.name}</Td>
                <Td>{s.description ?? '—'}</Td>
                <Td>{s.price.toLocaleString()} сум</Td>
                <Td>{s.duration} мин</Td>
                <Td><Btn><Pencil size={14} /></Btn></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Page>
  );
}
