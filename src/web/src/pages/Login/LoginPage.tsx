import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import { Eye, EyeOff, Stethoscope } from 'lucide-react';
import { useAuthStore } from '../../store/auth-store';
import { BRAND_NAME, BRAND_TAGLINE_RU } from '../../branding/constants';

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  width: 100%;
  max-width: 400px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const Tagline = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.8rem;
  margin: 0;
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

const InputWrapper = styled.div`
  position: relative;
`;

const Input = styled.input`
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9rem;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary}30;
  }
`;

const PasswordInput = styled(Input)`
  padding-right: 44px;
`;

const ToggleBtn = styled.button`
  position: absolute;
  right: ${({ theme }) => theme.spacing.sm};
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  padding: 4px;
`;

const SubmitBtn = styled.button`
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: ${({ theme }) => theme.spacing.sm};

  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.85rem;
  text-align: center;
  margin: 0;
`;

const RegisterLink = styled.p`
  text-align: center;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.md};
  a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }
`;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, isAuthenticated, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const ok = await login(email, password);
    if (ok) navigate('/');
  };

  return (
    <Page>
      <Card>
        <Header>
          <Logo>
            <Stethoscope size={28} />
            {BRAND_NAME}
          </Logo>
          <Tagline>{BRAND_TAGLINE_RU}</Tagline>
        </Header>

        <Form onSubmit={handleSubmit}>
          <Field>
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="email@clinic.uz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>

          <Field>
            <Label>Пароль</Label>
            <InputWrapper>
              <PasswordInput
                type={showPassword ? 'text' : 'password'}
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <ToggleBtn type="button" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </ToggleBtn>
            </InputWrapper>
          </Field>

          {error && <ErrorMsg>Неверный email или пароль</ErrorMsg>}

          <SubmitBtn type="submit" disabled={isLoading}>
            {isLoading ? 'Вход...' : 'Войти'}
          </SubmitBtn>
        </Form>

        <RegisterLink>
          Нет аккаунта? <Link to="/register">Зарегистрировать клинику</Link>
        </RegisterLink>
      </Card>
    </Page>
  );
}
