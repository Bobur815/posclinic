import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { BarChart2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { appointments as appointmentsApi } from '../../api/client';

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

const DateInput = styled.input`
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.85rem;
`;

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const StatLabel = styled.div`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const StatValue = styled.div`
  font-size: 1.8rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
`;

const StatSub = styled.div`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

interface Summary { total: number; completed: number; pending: number; revenue: number }

export function DailySummary() {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    appointmentsApi.getTodaySummary()
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [date]);

  return (
    <Page>
      <Header>
        <Title><BarChart2 size={22} /> Сводка за день</Title>
        <DateInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Header>

      {loading ? (
        <div style={{ color: 'gray' }}>Загрузка...</div>
      ) : summary ? (
        <Cards>
          <StatCard>
            <StatLabel><Calendar size={14} style={{ marginRight: 4 }} />Всего приёмов</StatLabel>
            <StatValue>{summary.total}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>Завершены</StatLabel>
            <StatValue>{summary.completed}</StatValue>
            <StatSub>{summary.total ? Math.round(summary.completed / summary.total * 100) : 0}%</StatSub>
          </StatCard>
          <StatCard>
            <StatLabel>Ожидают</StatLabel>
            <StatValue>{summary.pending}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>Выручка</StatLabel>
            <StatValue>{(summary.revenue / 1000).toFixed(0)}K</StatValue>
            <StatSub>{summary.revenue.toLocaleString()} сум</StatSub>
          </StatCard>
        </Cards>
      ) : (
        <div style={{ color: 'gray' }}>Данные не доступны</div>
      )}
    </Page>
  );
}
