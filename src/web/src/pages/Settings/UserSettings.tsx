import { useState } from 'react';
import styled from 'styled-components';
import { auth as authApi } from '../../api/client';

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  max-width: 400px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Title = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Field = styled.div`display: flex; flex-direction: column; gap: ${({ theme }) => theme.spacing.xs};`;
const Label = styled.label`font-size: 0.85rem; font-weight: 500; color: ${({ theme }) => theme.colors.text};`;
const Input = styled.input`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Btn = styled.button`
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Msg = styled.p<{ $error?: boolean }>`
  font-size: 0.85rem;
  color: ${({ $error, theme }) => $error ? theme.colors.error : theme.colors.success};
  margin: 0;
`;

export function UserSettings() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await authApi.changePassword(current, next);
      setMsg({ text: 'Пароль успешно изменён', error: false });
      setCurrent(''); setNext('');
    } catch {
      setMsg({ text: 'Ошибка при смене пароля', error: true });
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <Title>Смена пароля</Title>
      <Form onSubmit={handleSubmit}>
        <Field>
          <Label>Текущий пароль</Label>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field>
          <Label>Новый пароль</Label>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
        </Field>
        {msg && <Msg $error={msg.error}>{msg.text}</Msg>}
        <Btn type="submit" disabled={loading}>{loading ? 'Сохранение...' : 'Сменить пароль'}</Btn>
      </Form>
    </Card>
  );
}
