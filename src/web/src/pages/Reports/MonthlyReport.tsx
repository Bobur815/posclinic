import { useState } from 'react';
import styled from 'styled-components';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';

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

const MonthInput = styled.input`
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.85rem;
`;

const Placeholder = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function MonthlyReport() {
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  return (
    <Page>
      <Header>
        <Title><FileText size={22} /> Ежемесячный отчёт</Title>
        <MonthInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Header>
      <Placeholder>
        Данные за {month} будут отображены здесь
      </Placeholder>
    </Page>
  );
}
