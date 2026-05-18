import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { RefreshCw, Search, Users, ChevronRight } from 'lucide-react';
import { patients as patientsApi, type PatientRecord } from '../../api/client';

const Page = styled.div``;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
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

const SearchWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SearchInput = styled.input`
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  width: 220px;

  &::placeholder { color: ${({ theme }) => theme.colors.textSecondary}; }
`;

const IconBtn = styled.button`
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  display: flex;
  align-items: center;

  &:hover { color: ${({ theme }) => theme.colors.primary}; }
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

const Tr = styled.tr`
  cursor: pointer;
  &:hover td { background: ${({ theme }) => theme.colors.background}; }
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

export function PatientList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await patientsApi.getAll(query ? { search: query } : undefined);
      setData(result);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  return (
    <Page>
      <Header>
        <Title><Users size={22} /> Пациенты</Title>
        <SearchWrapper>
          <Search size={16} style={{ color: 'gray' }} />
          <SearchInput
            placeholder="Поиск по имени, телефону..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <IconBtn onClick={load}><RefreshCw size={16} /></IconBtn>
        </SearchWrapper>
      </Header>

      {loading ? (
        <Empty>Загрузка...</Empty>
      ) : data.length === 0 ? (
        <Empty>Пациенты не найдены</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Код</Th>
              <Th>ФИО</Th>
              <Th>Телефон</Th>
              <Th>Пол</Th>
              <Th>Группа крови</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <Tr key={p.id} onClick={() => navigate(`/patients/${p.id}`)}>
                <Td>{p.patientCode}</Td>
                <Td>{p.fullName}</Td>
                <Td>{p.phone}</Td>
                <Td>{p.gender === 'MALE' ? 'М' : p.gender === 'FEMALE' ? 'Ж' : '—'}</Td>
                <Td>{p.bloodType ?? '—'}</Td>
                <Td><ChevronRight size={16} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Page>
  );
}
