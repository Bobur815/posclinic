import { Paged } from '../../components/common/Pagination';
import React, { useEffect, useState } from 'react';
import { useDataVersion } from '../../hooks/useDataVersion';
import { AddressText } from '../../components/address/AddressText';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, Edit2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import type { CaseStatus, VitalsDto } from '../../../shared/clinic';
import { vitalsLine } from '../Care/care-format';
import { StatusBadge } from '../Care/care-ui';

interface PatientData {
  id: string;
  patientCode: string;
  fullName: string;
  phone: string;
  birthDate: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  address: string | null;
  city: string | null;
  regionCode: string | null;
  districtCode: string | null;
  notes: string | null;
  appointments: Array<{
    id: string;
    appointmentNumber: string;
    appointmentDate: string;
    status: string;
    totalAmount: number;
    doctor: { fullName: string } | null;
  }>;
  /** The latest measurement (patients:getById takes one). */
  vitals: VitalsDto[];
  cases: Array<{
    id: string;
    caseNumber: string;
    status: CaseStatus;
    openedAt: string;
    diagnosis: string | null;
  }>;
}

const Page = styled.div`
  max-width: 1280px;
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
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const EditBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  cursor: pointer;
  &:hover {
    opacity: 0.9;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const InfoCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
`;

const InfoRow = styled.div`
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  width: 140px;
  flex-shrink: 0;
`;

const InfoValue = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: 9px 12px;
  font-size: 13px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  display: flex;
  align-items: center;
  gap: 8px;
`;

export function PatientDetails() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const dataVersion = useDataVersion(['patients', 'appointments']);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    window.electronAPI.patients.getById(id).then((data) => {
      setPatient(data as PatientData);
      setIsLoading(false);
    });
  }, [id, dataVersion]);

  if (isLoading) return <Page>{t('common.loading')}</Page>;
  if (!patient) return <Page>{t('patients.errors.not_found')}</Page>;

  return (
    <Page>
      <BackBtn onClick={() => navigate('/patients')}>
        <ArrowLeft size={14} />
        {t('common.back')}
      </BackBtn>

      <Header>
        <Title>{patient.fullName}</Title>
        <EditBtn onClick={() => navigate(`/patients/${patient.id}/edit`)}>
          <Edit2 size={15} />
          {t('common.edit')}
        </EditBtn>
      </Header>

      <Grid>
        <InfoCard>
          <InfoRow>
            <InfoLabel>{t('patients.patientCode')}</InfoLabel>
            <InfoValue>{patient.patientCode}</InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>{t('patients.phone')}</InfoLabel>
            <InfoValue>{patient.phone}</InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>{t('patients.birthDate')}</InfoLabel>
            <InfoValue>
              {patient.birthDate ? format(new Date(patient.birthDate), 'dd.MM.yyyy') : '—'}
            </InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>{t('patients.gender')}</InfoLabel>
            <InfoValue>
              {patient.gender ? t(`common.${patient.gender.toLowerCase()}`, patient.gender) : '—'}
            </InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>{t('patients.bloodType')}</InfoLabel>
            <InfoValue>{patient.bloodType || '—'}</InfoValue>
          </InfoRow>
        </InfoCard>

        <InfoCard>
          <InfoRow>
            <InfoLabel>{t('patients.allergies')}</InfoLabel>
            <InfoValue>{patient.allergies || '—'}</InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>{t('care.chronicConditions')}</InfoLabel>
            <InfoValue>{patient.chronicConditions || '—'}</InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>{t('care.latestVitals')}</InfoLabel>
            <InfoValue>{vitalsLine(patient.vitals?.[0], t)}</InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>{t('address.street')}</InfoLabel>
            <InfoValue>{patient.address || '—'}</InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>{t('address.regionDistrict')}</InfoLabel>
            <InfoValue>
              <AddressText
                regionCode={patient.regionCode}
                districtCode={patient.districtCode}
                fallback={patient.city}
              />
            </InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>{t('patients.notes')}</InfoLabel>
            <InfoValue>{patient.notes || '—'}</InfoValue>
          </InfoRow>
        </InfoCard>
      </Grid>

      {patient.cases?.length > 0 && (
        <InfoCard>
          <SectionTitle>{t('care.cases')}</SectionTitle>
          {patient.cases.map((c) => (
            <InfoRow
              key={c.id}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/cases/${c.id}`)}
            >
              <InfoLabel>
                {c.caseNumber} · {format(new Date(c.openedAt), 'dd.MM.yyyy')}
              </InfoLabel>
              <InfoValue>
                {c.diagnosis ? `${c.diagnosis} ` : ''}
                <StatusBadge $status={c.status}>{t(`cases.status.${c.status}`)}</StatusBadge>
              </InfoValue>
            </InfoRow>
          ))}
        </InfoCard>
      )}

      <InfoCard>
        <SectionTitle>
          <Calendar size={18} />
          {t('patients.patientHistory')} ({patient.appointments?.length ?? 0})
        </SectionTitle>
        <Paged rows={patient.appointments ?? []}>
          {(pageRows) => (
            <Table>
              <thead>
                <tr>
                  <Th>{t('appointments.appointmentNumber')}</Th>
                  <Th>{t('appointments.doctor')}</Th>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('appointments.status')}</Th>
                  <Th>{t('appointments.totalAmount')}</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((appt) => (
                  <tr
                    key={appt.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/appointments/${appt.id}`)}
                  >
                    <Td>{appt.appointmentNumber}</Td>
                    <Td>{appt.doctor?.fullName || '—'}</Td>
                    <Td>{format(new Date(appt.appointmentDate), 'dd.MM.yyyy HH:mm')}</Td>
                    <Td>{t(`appointments.statuses.${appt.status}`, appt.status)}</Td>
                    <Td>
                      {Number(appt.totalAmount).toLocaleString()} {t('common.currency')}
                    </Td>
                  </tr>
                ))}
                {(patient.appointments ?? []).length === 0 && (
                  <tr>
                    <Td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                      {t('appointments.noAppointments')}
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Paged>
      </InfoCard>
    </Page>
  );
}
