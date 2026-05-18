import styled from 'styled-components';

const Section = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function SystemSettings() {
  return <Section>Системные настройки клиники</Section>;
}
