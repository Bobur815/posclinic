import React, { useEffect, useState, useCallback } from 'react';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Plus, Edit2, X, Save, Search, KeyRound } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ipcErrorKey } from '../../store/lan-store';
import type { DoctorDto as Doctor } from '../../../shared/clinic';

interface DoctorForm {
  fullName: string;
  specialty: string;
  phone: string;
  active: boolean;
}

const Page = styled.div``;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
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

const SearchIcon = styled.span`
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
`;

const SearchInput = styled.input`
  padding: 8px 14px 8px 36px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  width: 240px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
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
`;

const Badge = styled.span<{ $active: boolean }>`
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $active }) => ($active ? '#22c55e20' : '#ef444420')};
  color: ${({ $active }) => ($active ? '#22c55e' : '#ef4444')};
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

/* Modal */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  width: 440px;
  max-width: 95vw;
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ModalTitle = styled.h2`
  font-size: 17px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px;
  border-radius: 4px;
  display: flex;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.error};
  margin-left: 2px;
`;

const Input = styled.input`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const Select = styled.select`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const CancelBtn = styled.button`
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text};
`;

const SaveBtn = styled.button`
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
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const emptyForm: DoctorForm = { fullName: '', specialty: '', phone: '', active: true };

export function DoctorList() {
  const { t } = useTranslation();
  const toast = useToast();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [form, setForm] = useState<DoctorForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  // "Create login": the doctor signs in on their own PC and sees their queue.
  const [loginFor, setLoginFor] = useState<Doctor | null>(null);
  const [login, setLogin] = useState({ phone: '', password: '' });

  const handleCreateLogin = async () => {
    if (!loginFor) return;
    setIsSaving(true);
    try {
      await window.electronAPI.doctors.createLogin(loginFor.id, login);
      toast.success(t('common.success'));
      setLoginFor(null);
      setLogin({ phone: '', password: '' });
      loadDoctors();
    } catch (err) {
      // errors.phoneTaken / passwordTooShort / loginExists; the staff limit is toasted by LicenseBanner.
      const key = ipcErrorKey(err, 'common.error');
      if (!key.startsWith('license.')) toast.error(t(key));
    } finally {
      setIsSaving(false);
    }
  };

  const loadDoctors = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await window.electronAPI.doctors.getAll();
      setDoctors(data as Doctor[]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const dataVersion = useDataVersion(['doctors']);
  useEffect(() => { loadDoctors(); }, [loadDoctors, dataVersion]);

  const filtered = searchQuery
    ? doctors.filter(
        (d) =>
          d.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (d.specialty || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : doctors;

  const openAdd = () => {
    setEditingDoctor(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (doc: Doctor) => {
    setEditingDoctor(doc);
    setForm({
      fullName: doc.fullName,
      specialty: doc.specialty || '',
      phone: doc.phone || '',
      active: doc.active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        specialty: form.specialty.trim() || null,
        phone: form.phone.trim() || null,
        active: form.active,
      };
      if (editingDoctor) {
        await window.electronAPI.doctors.update(editingDoctor.id, payload);
      } else {
        await window.electronAPI.doctors.create(payload);
      }
      toast.success(t('common.success'));
      setShowModal(false);
      loadDoctors();
    } catch (err) {
      // Licence refusals (a second doctor without multiDoctor) are toasted by LicenseBanner.
      const key = ipcErrorKey(err, 'common.error');
      if (!key.startsWith('license.')) toast.error(t(key));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof DoctorForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = field === 'active' ? (e.target as HTMLSelectElement).value === 'true' : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Page>
      {showModal && (
        <Overlay onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <Modal>
            <ModalHeader>
              <ModalTitle>{editingDoctor ? t('doctors.editDoctor') : t('doctors.newDoctor')}</ModalTitle>
              <CloseBtn onClick={() => setShowModal(false)}><X size={18} /></CloseBtn>
            </ModalHeader>

            <FormGroup>
              <Label>{t('doctors.fullName')}<Required>*</Required></Label>
              <Input value={form.fullName} onChange={handleChange('fullName')} required />
            </FormGroup>
            <FormGroup>
              <Label>{t('doctors.specialty')}</Label>
              <Input value={form.specialty} onChange={handleChange('specialty')} />
            </FormGroup>
            <FormGroup>
              <Label>{t('patients.phone')}</Label>
              <Input type="tel" value={form.phone} onChange={handleChange('phone')} />
            </FormGroup>
            {/* doctors:create always makes an active doctor; the status is edited afterwards. */}
            {editingDoctor && (
              <FormGroup>
                <Label>{t('common.status')}</Label>
                <Select value={String(form.active)} onChange={handleChange('active')}>
                  <option value="true">{t('common.active')}</option>
                  <option value="false">{t('common.inactive')}</option>
                </Select>
              </FormGroup>
            )}

            <ModalFooter>
              <CancelBtn onClick={() => setShowModal(false)}>{t('common.cancel')}</CancelBtn>
              <SaveBtn onClick={handleSave} disabled={isSaving || !form.fullName.trim()}>
                <Save size={14} />
                {isSaving ? t('common.processing') : t('common.save')}
              </SaveBtn>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}

      {loginFor && (
        <Overlay onClick={(e) => { if (e.target === e.currentTarget) setLoginFor(null); }}>
          <Modal>
            <ModalHeader>
              <ModalTitle>{t('doctors.createLogin')}: {loginFor.fullName}</ModalTitle>
              <CloseBtn onClick={() => setLoginFor(null)}><X size={18} /></CloseBtn>
            </ModalHeader>
            <FormGroup>
              <Label>{t('auth.phone')}<Required>*</Required></Label>
              <Input
                type="tel"
                value={login.phone}
                onChange={(e) => setLogin({ ...login, phone: e.target.value })}
                placeholder="+998 90 123 45 67"
              />
            </FormGroup>
            <FormGroup>
              <Label>{t('auth.password')}<Required>*</Required></Label>
              <Input
                type="password"
                value={login.password}
                onChange={(e) => setLogin({ ...login, password: e.target.value })}
              />
            </FormGroup>
            <ModalFooter>
              <CancelBtn onClick={() => setLoginFor(null)}>{t('common.cancel')}</CancelBtn>
              <SaveBtn onClick={handleCreateLogin} disabled={isSaving || !login.phone || login.password.length < 6}>
                <KeyRound size={14} />
                {isSaving ? t('common.processing') : t('doctors.createLogin')}
              </SaveBtn>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}

      <Header>
        <Title>{t('doctors.title')}</Title>
        <Controls>
          <SearchWrapper>
            <SearchIcon><Search size={14} /></SearchIcon>
            <SearchInput
              placeholder={t('doctors.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SearchWrapper>
          <AddBtn onClick={openAdd}>
            <Plus size={16} />
            {t('doctors.newDoctor')}
          </AddBtn>
        </Controls>
      </Header>

      <TableWrapper>
        {isLoading ? (
          <EmptyState>{t('common.loading')}</EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState>{t('doctors.noDoctors')}</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('doctors.fullName')}</Th>
                <Th>{t('doctors.specialty')}</Th>
                <Th>{t('patients.phone')}</Th>
                <Th>{t('doctors.login')}</Th>
                <Th>{t('common.status')}</Th>
                <Th>{t('common.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => (
                <Tr key={doc.id}>
                  <Td style={{ fontWeight: 500 }}>{doc.fullName}</Td>
                  <Td>{doc.specialty || '—'}</Td>
                  <Td>{doc.phone || '—'}</Td>
                  <Td>
                    {doc.user ? (
                      doc.user.phone
                    ) : (
                      <ActionBtn
                        title={t('doctors.createLogin')}
                        onClick={() => {
                          setLogin({ phone: doc.phone ?? '', password: '' });
                          setLoginFor(doc);
                        }}
                      >
                        <KeyRound size={14} />
                      </ActionBtn>
                    )}
                  </Td>
                  <Td>
                    <Badge $active={doc.active}>
                      {doc.active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </Td>
                  <Td>
                    <ActionBtn onClick={() => openEdit(doc)}>
                      <Edit2 size={14} />
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
