import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Plus, Search, Edit2, X, Save } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuthStore } from '../../store/auth-store';

interface Service {
  id: string;
  code: string;
  name: string;
  price: number;
  duration: number | null;
  active: boolean;
}

interface ServiceForm {
  code: string;
  name: string;
  price: string;
  duration: string;
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
  width: 460px;
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

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FullWidth = styled(FormGroup)`
  grid-column: 1 / -1;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
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
  margin-top: ${({ theme }) => theme.spacing.lg};
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

const emptyForm: ServiceForm = { code: '', name: '', price: '', duration: '', active: true };

export function ServiceList() {
  const { t } = useTranslation();
  const toast = useToast();
  // Main refuses services:create/update for other roles; this only hides the controls.
  const canEdit = useAuthStore((s) => s.user?.role === 'CLINIC_ADMIN' || s.user?.role === 'SUPER_ADMIN');
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const loadServices = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await window.electronAPI.services.getAll();
      setServices(data as Service[]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadServices(); }, [loadServices]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      loadServices();
      return;
    }
    try {
      const data = await window.electronAPI.services.search(q);
      setServices(data as Service[]);
    } catch (err) {
      console.error(err);
    }
  };

  const openAdd = () => {
    setEditingService(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (svc: Service) => {
    setEditingService(svc);
    setForm({
      code: svc.code,
      name: svc.name,
      price: String(svc.price),
      duration: svc.duration ? String(svc.duration) : '',
      active: svc.active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return;
    setIsSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        price: parseFloat(form.price),
        duration: form.duration ? parseInt(form.duration) : null,
        active: form.active,
      };
      if (editingService) {
        await window.electronAPI.services.update(editingService.id, payload);
      } else {
        await window.electronAPI.services.create(payload);
      }
      toast.success(t('common.success'));
      setShowModal(false);
      loadServices();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof ServiceForm) => (
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
              <ModalTitle>{editingService ? t('services.editService') : t('services.newService')}</ModalTitle>
              <CloseBtn onClick={() => setShowModal(false)}><X size={18} /></CloseBtn>
            </ModalHeader>
            <FormGrid>
              <FormGroup>
                <Label>{t('services.code')}</Label>
                <Input value={form.code} onChange={handleChange('code')} placeholder="SVC-001" />
              </FormGroup>
              <FormGroup>
                <Label>{t('services.price')}</Label>
                <Input type="number" min={0} value={form.price} onChange={handleChange('price')} placeholder="0" required />
              </FormGroup>
              <FullWidth>
                <Label>{t('services.name')}</Label>
                <Input value={form.name} onChange={handleChange('name')} required />
              </FullWidth>
              <FormGroup>
                <Label>{t('services.duration')} ({t('common.minutes')})</Label>
                <Input type="number" min={0} value={form.duration} onChange={handleChange('duration')} placeholder="30" />
              </FormGroup>
              <FormGroup>
                <Label>{t('common.status')}</Label>
                <Select value={String(form.active)} onChange={handleChange('active')}>
                  <option value="true">{t('common.active')}</option>
                  <option value="false">{t('common.inactive')}</option>
                </Select>
              </FormGroup>
            </FormGrid>
            <ModalFooter>
              <CancelBtn onClick={() => setShowModal(false)}>{t('common.cancel')}</CancelBtn>
              <SaveBtn onClick={handleSave} disabled={isSaving || !form.name.trim() || !form.price}>
                <Save size={14} />
                {isSaving ? t('common.processing') : t('common.save')}
              </SaveBtn>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}

      <Header>
        <Title>{t('services.title')}</Title>
        <Controls>
          <SearchWrapper>
            <SearchIcon><Search size={14} /></SearchIcon>
            <SearchInput
              placeholder={t('services.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </SearchWrapper>
          {canEdit && (
            <AddBtn onClick={openAdd}>
              <Plus size={16} />
              {t('services.newService')}
            </AddBtn>
          )}
        </Controls>
      </Header>

      <TableWrapper>
        {isLoading ? (
          <EmptyState>{t('common.loading')}</EmptyState>
        ) : services.length === 0 ? (
          <EmptyState>{t('services.noServices')}</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('services.code')}</Th>
                <Th>{t('services.name')}</Th>
                <Th>{t('services.price')}</Th>
                <Th>{t('services.duration')}</Th>
                <Th>{t('common.status')}</Th>
                <Th>{t('common.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <Tr key={svc.id}>
                  <Td style={{ color: '#0891b2', fontWeight: 500 }}>{svc.code}</Td>
                  <Td>{svc.name}</Td>
                  <Td>{Number(svc.price).toLocaleString()} {t('common.currency')}</Td>
                  <Td>{svc.duration ? `${svc.duration} ${t('common.minutes')}` : '—'}</Td>
                  <Td>
                    <Badge $active={svc.active}>
                      {svc.active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </Td>
                  <Td>
                    {canEdit && (
                      <ActionBtn onClick={() => openEdit(svc)}>
                        <Edit2 size={14} />
                      </ActionBtn>
                    )}
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
