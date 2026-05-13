import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, Save } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const Page = styled.div`
  max-width: 720px;
`;

const BackBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary};
  font-size: 13px;
  cursor: pointer;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  &:hover { opacity: 0.8; }
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FullWidth = styled.div`
  grid-column: 1 / -1;
`;

const FormGroup = styled.div``;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.error};
  margin-left: 2px;
`;

const Input = styled.input`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Select = styled.select`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const CancelBtn = styled.button`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text};
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; }
`;

const SaveBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export function PatientForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEdit);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    birthDate: '',
    gender: '',
    bloodType: '',
    allergies: '',
    address: '',
    city: '',
    notes: '',
  });

  useEffect(() => {
    if (isEdit && id) {
      window.electronAPI.patients.getById(id).then((data) => {
        if (data) {
          const p = data as Record<string, unknown>;
          setForm({
            fullName: (p.fullName as string) || '',
            phone: (p.phone as string) || '',
            birthDate: p.birthDate ? new Date(p.birthDate as string).toISOString().slice(0, 10) : '',
            gender: (p.gender as string) || '',
            bloodType: (p.bloodType as string) || '',
            allergies: (p.allergies as string) || '',
            address: (p.address as string) || '',
            city: (p.city as string) || '',
            notes: (p.notes as string) || '',
          });
        }
        setIsFetching(false);
      });
    }
  }, [isEdit, id]);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isEdit && id) {
        await window.electronAPI.patients.update(id, form);
        toast.success(t('common.success'));
      } else {
        await window.electronAPI.patients.create(form);
        toast.success(t('common.success'));
      }
      navigate('/patients');
    } catch (err) {
      console.error(err);
      toast.error(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) return <Page><div>{t('common.loading')}</div></Page>;

  return (
    <Page>
      <BackBtn onClick={() => navigate('/patients')}>
        <ArrowLeft size={14} />
        {t('common.back')}
      </BackBtn>

      <Title>{isEdit ? t('patients.editPatient') : t('patients.newPatient')}</Title>

      <Card>
        <form onSubmit={handleSubmit}>
          <Grid>
            <FormGroup>
              <Label>{t('patients.fullName')}<Required>*</Required></Label>
              <Input value={form.fullName} onChange={handleChange('fullName')} required />
            </FormGroup>
            <FormGroup>
              <Label>{t('patients.phone')}<Required>*</Required></Label>
              <Input type="tel" value={form.phone} onChange={handleChange('phone')} required />
            </FormGroup>
            <FormGroup>
              <Label>{t('patients.birthDate')}</Label>
              <Input type="date" value={form.birthDate} onChange={handleChange('birthDate')} />
            </FormGroup>
            <FormGroup>
              <Label>{t('patients.gender')}</Label>
              <Select value={form.gender} onChange={handleChange('gender')}>
                <option value="">—</option>
                <option value="MALE">{t('common.male')}</option>
                <option value="FEMALE">{t('common.female')}</option>
                <option value="OTHER">{t('common.other')}</option>
              </Select>
            </FormGroup>
            <FormGroup>
              <Label>{t('patients.bloodType')}</Label>
              <Select value={form.bloodType} onChange={handleChange('bloodType')}>
                <option value="">—</option>
                {BLOOD_TYPES.map((bt) => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup>
              <Label>{t('patients.city')}</Label>
              <Input value={form.city} onChange={handleChange('city')} />
            </FormGroup>
            <FullWidth>
              <FormGroup>
                <Label>{t('patients.allergies')}</Label>
                <Input value={form.allergies} onChange={handleChange('allergies')} />
              </FormGroup>
            </FullWidth>
            <FullWidth>
              <FormGroup>
                <Label>{t('patients.address')}</Label>
                <Input value={form.address} onChange={handleChange('address')} />
              </FormGroup>
            </FullWidth>
            <FullWidth>
              <FormGroup>
                <Label>{t('patients.notes')}</Label>
                <Textarea value={form.notes} onChange={handleChange('notes')} />
              </FormGroup>
            </FullWidth>
          </Grid>

          <Footer>
            <CancelBtn type="button" onClick={() => navigate('/patients')}>
              {t('common.cancel')}
            </CancelBtn>
            <SaveBtn type="submit" disabled={isLoading}>
              <Save size={15} />
              {isLoading ? t('common.processing') : t('common.save')}
            </SaveBtn>
          </Footer>
        </form>
      </Card>
    </Page>
  );
}
