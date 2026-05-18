import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, User } from 'lucide-react';
import { patients as patientsApi, type PatientRecord } from '../../api/client';

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
`;

const Name = styled.h2`
  font-size: 1.3rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const Field = styled.div``;
const FieldLabel = styled.div`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;
const FieldValue = styled.div`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.text};
  font-weight: 500;
`;

const Empty = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function PatientDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    patientsApi.getById(id)
      .then(setPatient)
      .catch(() => setPatient(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Empty>Загрузка...</Empty>;
  if (!patient) return <Empty>Пациент не найден</Empty>;

  return (
    <Page>
      <BackBtn onClick={() => navigate('/patients')}>
        <ArrowLeft size={16} /> Назад к списку
      </BackBtn>

      <Card>
        <Name><User size={20} /> {patient.fullName}</Name>
        <Grid>
          <Field><FieldLabel>Код пациента</FieldLabel><FieldValue>{patient.patientCode}</FieldValue></Field>
          <Field><FieldLabel>Телефон</FieldLabel><FieldValue>{patient.phone}</FieldValue></Field>
          <Field><FieldLabel>Пол</FieldLabel><FieldValue>{patient.gender === 'MALE' ? 'Мужской' : patient.gender === 'FEMALE' ? 'Женский' : '—'}</FieldValue></Field>
          <Field><FieldLabel>Группа крови</FieldLabel><FieldValue>{patient.bloodType ?? '—'}</FieldValue></Field>
          <Field><FieldLabel>Дата рождения</FieldLabel><FieldValue>{patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('ru-RU') : '—'}</FieldValue></Field>
          <Field><FieldLabel>Город</FieldLabel><FieldValue>{patient.city ?? '—'}</FieldValue></Field>
          <Field><FieldLabel>Адрес</FieldLabel><FieldValue>{patient.address ?? '—'}</FieldValue></Field>
          <Field><FieldLabel>Аллергии</FieldLabel><FieldValue>{patient.allergies ?? '—'}</FieldValue></Field>
          {patient.notes && <Field style={{ gridColumn: '1 / -1' }}><FieldLabel>Заметки</FieldLabel><FieldValue>{patient.notes}</FieldValue></Field>}
        </Grid>
      </Card>
    </Page>
  );
}
