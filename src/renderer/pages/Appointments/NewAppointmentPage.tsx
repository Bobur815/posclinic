import React, { useState, useEffect, useCallback } from 'react';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, Search, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '../../context/ToastContext';
import { ipcErrorKey } from '../../store/lan-store';

interface Patient {
  id: string;
  patientCode: string;
  fullName: string;
  phone: string;
}

interface Doctor {
  id: string;
  fullName: string;
  specialty: string | null;
}

interface Service {
  id: string;
  code: string;
  name: string;
  price: number;
  duration: number;
}

interface AppointmentItemLocal {
  serviceId: string;
  serviceName: string;
  price: number;
  quantity: number;
  total: number;
}

const Page = styled.div`
  max-width: 900px;
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

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const StepTabs = styled.div`
  display: flex;
  gap: 0;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const StepTab = styled.div<{ $active: boolean; $done: boolean }>`
  padding: 10px 20px;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active, $done, theme }) =>
    $active ? theme.colors.primary : $done ? theme.colors.success : theme.colors.textSecondary};
  border-bottom: 2px solid ${({ $active, $done, theme }) =>
    $active ? theme.colors.primary : $done ? theme.colors.success : 'transparent'};
  margin-bottom: -1px;
  cursor: ${({ $done }) => ($done ? 'pointer' : 'default')};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FormGroup = styled.div``;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
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

const SearchResults = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  max-height: 200px;
  overflow-y: auto;
  z-index: 50;
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

const SearchResultItem = styled.div`
  padding: 8px 12px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.background}; }
`;

const ResultName = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const ResultSub = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const RelativeWrapper = styled.div`
  position: relative;
`;

const SelectedChip = styled.div`
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.primary}18;
  border: 1px solid ${({ theme }) => theme.colors.primary}40;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.primary};
  font-weight: 500;
`;

const ServiceTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: 8px 10px;
  font-size: 13px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const QtyInput = styled.input`
  width: 60px;
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  text-align: center;
`;

const RemoveBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.error};
  padding: 4px;
  border-radius: 4px;
  &:hover { background: ${({ theme }) => theme.colors.error}10; }
`;

const TotalRow = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 12px 0 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  margin-top: 8px;
`;

const TotalLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const TotalValue = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
`;

const NavBtns = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const Btn = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: ${({ $variant, theme }) => $variant === 'primary' ? 'none' : `1px solid ${theme.colors.border}`};
  background: ${({ $variant, theme }) => $variant === 'primary' ? theme.colors.primary : 'transparent'};
  color: ${({ $variant, theme }) => $variant === 'primary' ? 'white' : theme.colors.text};
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EmptyServices = styled.div`
  text-align: center;
  padding: 20px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
`;

export function NewAppointmentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Patient
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Step 2: Doctor + Date
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  // datetime-local wants the LOCAL time; toISOString() would be UTC (5 hours early in Tashkent).
  const [appointmentDate, setAppointmentDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [notes, setNotes] = useState('');

  // Step 3: Services
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceResults, setServiceResults] = useState<Service[]>([]);
  const [items, setItems] = useState<AppointmentItemLocal[]>([]);

  const doctorsVersion = useDataVersion(['doctors']);
  useEffect(() => {
    window.electronAPI.doctors.getActive().then((data) => {
      setDoctors(data as Doctor[]);
    });
  }, [doctorsVersion]);

  const handlePatientSearch = useCallback(async (q: string) => {
    setPatientSearch(q);
    if (!q.trim()) { setPatientResults([]); return; }
    const data = await window.electronAPI.patients.search(q);
    setPatientResults((data as Patient[]).slice(0, 8));
  }, []);

  const handleServiceSearch = useCallback(async (q: string) => {
    setServiceSearch(q);
    if (!q.trim()) { setServiceResults([]); return; }
    const data = await window.electronAPI.services.search(q);
    setServiceResults((data as Service[]).slice(0, 8));
  }, []);

  const addService = (service: Service) => {
    setServiceSearch('');
    setServiceResults([]);
    setItems((prev) => {
      const existing = prev.find((i) => i.serviceId === service.id);
      if (existing) {
        return prev.map((i) =>
          i.serviceId === service.id
            ? { ...i, quantity: i.quantity + 1, total: Number(service.price) * (i.quantity + 1) }
            : i
        );
      }
      return [...prev, {
        serviceId: service.id,
        serviceName: service.name,
        price: Number(service.price),
        quantity: 1,
        total: Number(service.price),
      }];
    });
  };

  const removeItem = (serviceId: string) => {
    setItems((prev) => prev.filter((i) => i.serviceId !== serviceId));
  };

  const updateQty = (serviceId: string, qty: number) => {
    if (qty <= 0) { removeItem(serviceId); return; }
    setItems((prev) =>
      prev.map((i) =>
        i.serviceId === serviceId ? { ...i, quantity: qty, total: i.price * qty } : i
      )
    );
  };

  const getTotal = () => items.reduce((sum, i) => sum + i.total, 0);

  const handleCreate = async () => {
    if (!selectedPatient || !selectedDoctorId || !appointmentDate || items.length === 0) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI.appointments.create({
        patientId: selectedPatient.id,
        doctorId: selectedDoctorId,
        // The local time typed, as an instant (`new Date('…T09:00')` reads it as local).
        appointmentDate: new Date(appointmentDate).toISOString(),
        notes,
        // Prices shown here are a preview; the main till prices the visit from its catalog.
        items: items.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity })),
      });
      const appt = result as { id: string };
      toast.success(t('common.success'));
      navigate(`/appointments/${appt.id}/checkout`);
    } catch (err) {
      // The monthly visit limit is toasted by LicenseBanner.
      const key = ipcErrorKey(err, 'common.error');
      if (!key.startsWith('license.')) toast.error(t(key));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Page>
      <BackBtn onClick={() => navigate('/appointments')}>
        <ArrowLeft size={14} />
        {t('common.back')}
      </BackBtn>
      <Title>{t('appointments.newAppointment')}</Title>

      <StepTabs>
        {[1, 2, 3].map((s) => (
          <StepTab key={s} $active={step === s} $done={step > s} onClick={() => step > s && setStep(s)}>
            {t('setup.step')} {s}
          </StepTab>
        ))}
      </StepTabs>

      {/* Step 1: Patient */}
      {step === 1 && (
        <Card>
          <FormGroup>
            <Label>{t('appointments.selectPatient')}</Label>
            {selectedPatient ? (
              <div>
                <SelectedChip>
                  {selectedPatient.fullName} — {selectedPatient.phone}
                </SelectedChip>
                <Btn
                  $variant="secondary"
                  style={{ marginTop: '8px', padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => setSelectedPatient(null)}
                >
                  {t('common.clear')}
                </Btn>
              </div>
            ) : (
              <RelativeWrapper>
                <Input
                  placeholder={t('appointments.searchPatient')}
                  value={patientSearch}
                  onChange={(e) => handlePatientSearch(e.target.value)}
                  autoFocus
                />
                {patientResults.length > 0 && (
                  <SearchResults>
                    {patientResults.map((p) => (
                      <SearchResultItem key={p.id} onClick={() => { setSelectedPatient(p); setPatientResults([]); }}>
                        <ResultName>{p.fullName}</ResultName>
                        <ResultSub>{p.patientCode} · {p.phone}</ResultSub>
                      </SearchResultItem>
                    ))}
                  </SearchResults>
                )}
              </RelativeWrapper>
            )}
          </FormGroup>
          <NavBtns>
            <Btn $variant="primary" disabled={!selectedPatient} onClick={() => setStep(2)}>
              {t('common.next')}
            </Btn>
          </NavBtns>
        </Card>
      )}

      {/* Step 2: Doctor + Date */}
      {step === 2 && (
        <Card>
          <Grid>
            <FormGroup>
              <Label>{t('appointments.selectDoctor')}</Label>
              <Select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)}>
                <option value="">—</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}{d.specialty ? ` (${d.specialty})` : ''}
                  </option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup>
              <Label>{t('appointments.appointmentDate')}</Label>
              <Input
                type="datetime-local"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
              />
            </FormGroup>
            <div style={{ gridColumn: '1/-1' }}>
              <Label>{t('common.notes')}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </Grid>
          <NavBtns>
            <Btn $variant="secondary" onClick={() => setStep(1)}>{t('common.back')}</Btn>
            <Btn $variant="primary" disabled={!selectedDoctorId} onClick={() => setStep(3)}>
              {t('common.next')}
            </Btn>
          </NavBtns>
        </Card>
      )}

      {/* Step 3: Services */}
      {step === 3 && (
        <Card>
          <FormGroup>
            <Label>{t('appointments.addService')}</Label>
            <RelativeWrapper>
              <Input
                placeholder={t('appointments.searchService')}
                value={serviceSearch}
                onChange={(e) => handleServiceSearch(e.target.value)}
              />
              {serviceResults.length > 0 && (
                <SearchResults>
                  {serviceResults.map((s) => (
                    <SearchResultItem key={s.id} onClick={() => addService(s)}>
                      <ResultName>{s.name}</ResultName>
                      <ResultSub>{s.code} · {Number(s.price).toLocaleString()} {t('common.currency')}</ResultSub>
                    </SearchResultItem>
                  ))}
                </SearchResults>
              )}
            </RelativeWrapper>
          </FormGroup>

          {items.length === 0 ? (
            <EmptyServices>{t('appointments.noItemsAdded')}</EmptyServices>
          ) : (
            <ServiceTable>
              <thead>
                <tr>
                  <Th>{t('services.name')}</Th>
                  <Th>{t('appointments.unitPrice')}</Th>
                  <Th>{t('appointments.quantity')}</Th>
                  <Th>{t('appointments.subtotal')}</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.serviceId}>
                    <Td>{item.serviceName}</Td>
                    <Td>{item.price.toLocaleString()} {t('common.currency')}</Td>
                    <Td>
                      <QtyInput
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateQty(item.serviceId, parseInt(e.target.value) || 1)}
                      />
                    </Td>
                    <Td>{item.total.toLocaleString()} {t('common.currency')}</Td>
                    <Td>
                      <RemoveBtn onClick={() => removeItem(item.serviceId)}>
                        <Trash2 size={14} />
                      </RemoveBtn>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ServiceTable>
          )}

          {items.length > 0 && (
            <TotalRow>
              <TotalLabel>{t('common.total')}:</TotalLabel>
              <TotalValue>{getTotal().toLocaleString()} {t('common.currency')}</TotalValue>
            </TotalRow>
          )}

          <NavBtns>
            <Btn $variant="secondary" onClick={() => setStep(2)}>{t('common.back')}</Btn>
            <Btn $variant="primary" disabled={items.length === 0 || isLoading} onClick={handleCreate}>
              {isLoading ? t('common.processing') : t('appointments.createAppointment')}
            </Btn>
          </NavBtns>
        </Card>
      )}
    </Page>
  );
}
