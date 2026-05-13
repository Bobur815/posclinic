import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Plus, Search, Eye, Edit2 } from 'lucide-react';
import { format } from 'date-fns';

interface Patient {
  id: string;
  patientCode: string;
  fullName: string;
  phone: string;
  birthDate: string | null;
  gender: string | null;
  active: boolean;
}

const Page = styled.div``;

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

const Controls = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`;

const SearchWrapper = styled.div`
  position: relative;
`;

const SearchInput = styled.input`
  padding: 8px 14px 8px 36px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  width: 280px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
`;

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  &:hover { opacity: 0.9; }
`;

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: 10px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Tr = styled.tr`
  &:last-child td { border-bottom: none; }
  &:hover td { background: ${({ theme }) => theme.colors.background}; }
  cursor: pointer;
`;

const ActionBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover { color: ${({ theme }) => theme.colors.primary}; background: ${({ theme }) => theme.colors.background}; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function PatientList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadPatients = useCallback(async () => {
    try {
      const data = await window.electronAPI.patients.getAll();
      setPatients(data as Patient[]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      loadPatients();
      return;
    }
    try {
      const data = await window.electronAPI.patients.search(query);
      setPatients(data as Patient[]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Page>
      <Header>
        <Title>{t('patients.title')}</Title>
        <Controls>
          <SearchWrapper>
            <SearchIcon><Search size={14} /></SearchIcon>
            <SearchInput
              type="text"
              placeholder={t('patients.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </SearchWrapper>
          <AddBtn onClick={() => navigate('/patients/new')}>
            <Plus size={16} />
            {t('patients.newPatient')}
          </AddBtn>
        </Controls>
      </Header>

      <TableWrapper>
        {isLoading ? (
          <EmptyState>{t('common.loading')}</EmptyState>
        ) : patients.length === 0 ? (
          <EmptyState>{t('patients.noPatients')}</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('patients.patientCode')}</Th>
                <Th>{t('patients.fullName')}</Th>
                <Th>{t('patients.phone')}</Th>
                <Th>{t('patients.birthDate')}</Th>
                <Th>{t('patients.gender')}</Th>
                <Th>{t('common.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <Tr key={patient.id}>
                  <Td>{patient.patientCode}</Td>
                  <Td>{patient.fullName}</Td>
                  <Td>{patient.phone}</Td>
                  <Td>{patient.birthDate ? format(new Date(patient.birthDate), 'dd.MM.yyyy') : '—'}</Td>
                  <Td>{patient.gender ? t(`common.${patient.gender.toLowerCase()}`, patient.gender) : '—'}</Td>
                  <Td>
                    <ActionBtn onClick={() => navigate(`/patients/${patient.id}`)} title={t('common.actions')}>
                      <Eye size={15} />
                    </ActionBtn>
                    <ActionBtn onClick={(e) => { e.stopPropagation(); navigate(`/patients/${patient.id}`); }} title={t('common.edit')}>
                      <Edit2 size={15} />
                    </ActionBtn>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrapper>
    </Page>
  );
}
