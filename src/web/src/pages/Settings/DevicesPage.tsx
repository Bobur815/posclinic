import styled from 'styled-components';
import { Monitor } from 'lucide-react';

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function DevicesPage() {
  return (
    <Card>
      <Monitor size={20} />
      Управление терминалами будет доступно здесь
    </Card>
  );
}
