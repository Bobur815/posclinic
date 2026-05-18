import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft } from 'lucide-react';
import { users as usersApi, type UserRecord } from '../../api/client';
import type { UserRole } from '@shared/types';

const Page = styled.div``;

const BackBtn = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  font-size: 0.875rem;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: 0;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  max-width: 480px;
`;

const Title = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  font-size: 1.1rem;
  color: ${({ theme }) => theme.colors.text};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Label = styled.label`
  font-size: 0.85rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const Input = styled.input`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;

  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Select = styled.select`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;

  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const BtnRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const Btn = styled.button<{ $variant?: 'primary' }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${({ $variant, theme }) => $variant === 'primary' ? 'transparent' : theme.colors.border};
  background: ${({ $variant, theme }) => $variant === 'primary' ? theme.colors.primary : theme.colors.surface};
  color: ${({ $variant, theme }) => $variant === 'primary' ? '#fff' : theme.colors.text};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const CLINIC_ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: 'Администратор' },
  { value: 'NURSE', label: 'Медработник' },
  { value: 'PATIENT', label: 'Пациент' },
];

export function UserForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('NURSE');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    usersApi.getById(id).then((u: UserRecord) => {
      setFirstName(u.firstName);
      setLastName(u.lastName);
      setEmail(u.email);
      setPhone(u.phone ?? '');
      setRole(u.role);
    });
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit && id) {
        await usersApi.update(id, { firstName, lastName, email, phone: phone || undefined, role });
      } else {
        await usersApi.create({ firstName, lastName, email, phone: phone || undefined, role, password });
      }
      navigate('/users');
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <Page>
      <BackBtn onClick={() => navigate('/users')}><ArrowLeft size={16} /> Назад</BackBtn>
      <Card>
        <Title>{isEdit ? 'Редактировать пользователя' : 'Новый пользователь'}</Title>
        <Form onSubmit={handleSubmit}>
          <Field>
            <Label>Имя</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="Азиза" />
          </Field>
          <Field>
            <Label>Фамилия</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required placeholder="Каримова" />
          </Field>
          <Field>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="user@clinic.uz" />
          </Field>
          <Field>
            <Label>Телефон (необязательно)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998901234567" />
          </Field>
          <Field>
            <Label>Роль</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {CLINIC_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
          {!isEdit && (
            <Field>
              <Label>Пароль</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Минимум 6 символов" minLength={6} />
            </Field>
          )}
          <BtnRow>
            <Btn type="button" onClick={() => navigate('/users')}>Отмена</Btn>
            <Btn $variant="primary" type="submit" disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить'}</Btn>
          </BtnRow>
        </Form>
      </Card>
    </Page>
  );
}
