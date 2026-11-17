import { Paged } from '../../components/common/Pagination';
import { format } from 'date-fns';
import { ArrowLeft, Plus, Search, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import type {
  DoctorDto,
  OpenCaseDto,
  PatientDto,
  QuoteDto,
  RecentPatientDto,
  RegisterLineInput,
  ServiceDto,
  ServiceKind,
} from '../../../shared/clinic';
import { AddressSelector, type AddressValue } from '../../components/address/AddressSelector';
import { AddressText } from '../../components/address/AddressText';
import { useCustomTypes, useServiceTypeLabel } from '../../hooks/useCustomTypes';
import { CatalogCard } from './CatalogCard';
import { useToast } from '../../context/ToastContext';
import { useDataVersion } from '../../hooks/useDataVersion';
import { ipcErrorKey } from '../../store/lan-store';
import { PhoneInput } from '../../components/form/PhoneInput';

/**
 * Reception: register services for a patient (v2.5). Step 1 finds the patient (name, phone,
 * code, region / district, visit dates). Step 2 builds the order inside the patient's case: the
 * doctor's referrals first, then the catalog; a doctor only for consultations; a course either
 * for today or in full (with a discount). Prices on screen come from `appointments:quote`, the
 * same code main charges with. Payment is the existing checkout page.
 */

interface Line extends RegisterLineInput {
  key: string;
}

const KIND_ORDER: ServiceKind[] = ['CONSULTATION', 'ANALYSIS', 'PROCEDURE', 'DIRECT_SALE'];
let lineSeq = 0;
const newKey = () => `l${++lineSeq}`;

export function RegisterVisitPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  const [step, setStep] = useState<1 | 2>(1);
  const [patient, setPatient] = useState<PatientDto | null>(null);

  // ── Step 1: find the patient ──────────────────────────────────────────────────────────────
  const [q, setQ] = useState('');
  const [address, setAddress] = useState<AddressValue>({ regionCode: null, districtCode: null });
  const [visitedFrom, setVisitedFrom] = useState('');
  const [visitedTo, setVisitedTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<PatientDto[]>([]);
  // Before anything is typed: the patients of the latest visits, one click away.
  const [recent, setRecent] = useState<RecentPatientDto[] | null>(null);
  const recentVersion = useDataVersion(['appointments', 'patients']);
  useEffect(() => {
    window.electronAPI.patients
      .recent(12)
      .then(setRecent)
      .catch(() => setRecent([]));
  }, [recentVersion]);
  const [searching, setSearching] = useState(false);

  // Coming back from "New patient": start on that patient.
  useEffect(() => {
    const id = params.get('patientId');
    if (!id) return;
    window.electronAPI.patients.getById(id).then((p) => {
      if (p) {
        setPatient(p);
        setStep(2);
      }
    });
  }, [params]);

  const criteria = useMemo(
    () => ({ q: q.trim(), ...address, visitedFrom, visitedTo }),
    [q, address, visitedFrom, visitedTo],
  );
  const hasCriteria = Boolean(
    criteria.q || criteria.regionCode || criteria.visitedFrom || criteria.visitedTo,
  );
  useEffect(() => {
    if (!hasCriteria) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      window.electronAPI.patients
        .search({
          q: criteria.q,
          regionCode: criteria.regionCode,
          districtCode: criteria.districtCode,
          visitedFrom: criteria.visitedFrom || undefined,
          visitedTo: criteria.visitedTo || undefined,
        })
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setSearching(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [criteria, hasCriteria]);

  const choosePatient = (p: PatientDto) => {
    setPatient(p);
    setLines([]);
    setApproval(null);
    setStep(2);
  };

  // ── Step 2: the order ─────────────────────────────────────────────────────────────────────
  const [cases, setCases] = useState<OpenCaseDto[]>([]);
  const [caseId, setCaseId] = useState<string>(''); // '' = new case
  const [doctors, setDoctors] = useState<DoctorDto[]>([]);
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [serviceQ, setServiceQ] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [approval, setApproval] = useState<{ phone: string; password: string } | null>(null);
  const [askApproval, setAskApproval] = useState(false);
  const [saving, setSaving] = useState(false);

  // Custom order types (Settings → Types): the cards show a service's type, not only its kind.
  const { serviceTypes } = useCustomTypes();
  const typeOf = useServiceTypeLabel(serviceTypes);

  const catalogVersion = useDataVersion(['services', 'doctors']);
  useEffect(() => {
    window.electronAPI.doctors.getActive().then(setDoctors);
    window.electronAPI.services.getActive().then(setServices);
  }, [catalogVersion]);

  const casesVersion = useDataVersion(['appointments', 'cases']);
  useEffect(() => {
    if (!patient) return;
    window.electronAPI.cases.forPatient(patient.id).then((list) => {
      setCases(list);
      // The latest open case continues by default; reception can still open a new one.
      setCaseId((cur) => (cur && list.some((c) => c.id === cur) ? cur : (list[0]?.id ?? '')));
    });
  }, [patient, casesVersion]);

  const theCase = cases.find((c) => c.id === caseId) ?? null;
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const defaultDoctor = theCase?.doctorId ?? (doctors.length === 1 ? doctors[0].id : null);
  const addService = (s: ServiceDto) => {
    setServiceQ('');
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        serviceId: s.id,
        quantity: 1,
        doctorId: s.kind === 'CONSULTATION' ? defaultDoctor : null,
      },
    ]);
  };
  const addReferral = (
    r: OpenCaseDto['referrals'][number],
    quantity: number,
    fullCourse: boolean,
  ) => {
    setCaseId(r.caseId);
    setLines((prev) => [
      ...prev.filter((l) => l.referralId !== r.id),
      {
        key: newKey(),
        serviceId: r.serviceId,
        referralId: r.id,
        quantity,
        fullCourse,
        doctorId: r.service.kind === 'CONSULTATION' ? (r.doctorId ?? defaultDoctor) : null,
      },
    ]);
  };
  const patch = (key: string, p: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const remove = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  /**
   * A discount only for a course paid in full upfront: a procedure of 2+ sessions that, from a
   * referral, covers all it has left (main's rule, pricing.ts). The screen offers "paid upfront"
   * only then, and sends no discount otherwise (e.g. after the quantity was lowered).
   */
  const discountAllowed = useCallback(
    (l: Line) => {
      const s = serviceById.get(l.serviceId);
      if (s?.kind !== 'PROCEDURE' || l.quantity < 2) return false;
      if (!l.referralId) return true;
      const r = cases.flatMap((c) => c.referrals).find((x) => x.id === l.referralId);
      return !!r && l.quantity === r.remaining;
    },
    [serviceById, cases],
  );

  const payload = useMemo(
    () =>
      patient
        ? {
            patientId: patient.id,
            caseId: caseId || null,
            items: lines.map(({ key: _k, ...l }) => {
              const full = l.fullCourse === true && discountAllowed({ key: _k, ...l });
              return {
                ...l,
                fullCourse: full,
                discountPercent: full ? (l.discountPercent ?? 0) : 0,
              };
            }),
            approval,
          }
        : null,
    [patient, caseId, lines, approval, discountAllowed],
  );

  // Live quote: the price main will charge (follow-up, discounts), or why it would refuse.
  const quoteSeq = useRef(0);
  useEffect(() => {
    if (!payload || payload.items.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const seq = ++quoteSeq.current;
    const timer = setTimeout(() => {
      window.electronAPI.appointments
        .quote(payload)
        .then((r) => {
          if (seq !== quoteSeq.current) return;
          setQuote(r);
          setQuoteError(null);
        })
        .catch((e) => {
          if (seq !== quoteSeq.current) return;
          setQuote(null);
          setQuoteError(ipcErrorKey(e, 'common.error'));
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [payload]);

  const quoted = (key: string) => {
    const i = lines.findIndex((l) => l.key === key);
    return i >= 0 ? quote?.lines[i] : undefined;
  };

  const save = async () => {
    if (!payload || !quote) return;
    setSaving(true);
    try {
      const order = await window.electronAPI.appointments.create(payload);
      toast.success(t('common.success'));
      // Nothing to pay (a free follow-up): it is already in the doctor's queue.
      navigate(
        order.totalAmount > 0 ? `/appointments/${order.id}/checkout` : `/appointments/${order.id}`,
      );
    } catch (e) {
      const key = ipcErrorKey(e, 'common.error');
      // A wrong admin password: forget it, so the dialog can be filled in again.
      if (key === 'errors.approvalFailed' || key === 'errors.tooManyAttempts') setApproval(null);
      if (!key.startsWith('license.')) toast.error(t(key));
    } finally {
      setSaving(false);
    }
  };

  const sq = serviceQ.trim().toLowerCase();
  const catalog = services
    .filter((s) => !sq || s.name.toLowerCase().includes(sq) || s.code.toLowerCase().includes(sq))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const money = (n: number) => `${n.toLocaleString()} ${t('common.currency')}`;

  return (
    <Page>
      <BackBtn
        onClick={() =>
          step === 2 && !params.get('patientId') ? setStep(1) : navigate('/appointments')
        }
      >
        <ArrowLeft size={14} />
        {t('common.back')}
      </BackBtn>
      <Title>{t('register.title')}</Title>
      <Steps>
        <StepTab $active={step === 1} $done={step > 1} onClick={() => setStep(1)}>
          1. {t('register.stepPatient')}
        </StepTab>
        <StepTab $active={step === 2} $done={false} disabled={!patient}>
          2. {t('register.stepServices')}
        </StepTab>
        <StepTab $active={false} $done={false} disabled>
          3. {t('register.stepPayment')}
        </StepTab>
      </Steps>

      {step === 1 && (
        <Card>
          <SearchRow>
            <SearchBox>
              <Search size={15} />
              <input
                placeholder={t('register.searchPlaceholder')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
              />
            </SearchBox>
            <Btn $variant="secondary" onClick={() => setShowFilters((v) => !v)}>
              {t('register.filters')}
            </Btn>
            <Btn $variant="secondary" onClick={() => navigate('/patients/new?return=register')}>
              <UserPlus size={15} />
              {t('patients.newPatient')}
            </Btn>
          </SearchRow>
          {showFilters && (
            <Filters>
              <AddressSelector value={address} onChange={setAddress} />
              <Row2>
                <div>
                  <Label>{t('register.visitedFrom')}</Label>
                  <Input
                    type="date"
                    value={visitedFrom}
                    onChange={(e) => setVisitedFrom(e.target.value)}
                  />
                </div>
                <div>
                  <Label>{t('register.visitedTo')}</Label>
                  <Input
                    type="date"
                    value={visitedTo}
                    onChange={(e) => setVisitedTo(e.target.value)}
                  />
                </div>
              </Row2>
            </Filters>
          )}

          {!hasCriteria ? (
            recent === null ? (
              <Empty>{t('common.loading')}</Empty>
            ) : recent.length === 0 ? (
              <Empty>{t('register.searchHint')}</Empty>
            ) : (
              <>
                <ListTitle>{t('register.recentPatients')}</ListTitle>
                <Results>
                  {recent.map((p) => (
                    <ResultRow key={p.id} type="button" onClick={() => choosePatient(p)}>
                      <RowHead>
                        <strong>{p.fullName}</strong>
                        <Muted>{format(new Date(p.lastVisitAt), 'dd.MM.yyyy HH:mm')}</Muted>
                      </RowHead>
                      <Muted>
                        {p.patientCode} · {p.phone}
                        {p.birthDate ? ` · ${p.birthDate.slice(0, 4)}` : ''}
                      </Muted>
                      {p.lastServices.length > 0 && <Muted>{p.lastServices.join(', ')}</Muted>}
                    </ResultRow>
                  ))}
                </Results>
              </>
            )
          ) : searching && results.length === 0 ? (
            <Empty>{t('common.loading')}</Empty>
          ) : results.length === 0 ? (
            <Empty>{t('register.noPatients')}</Empty>
          ) : (
            <Results>
              {results.map((p) => (
                <ResultRow key={p.id} type="button" onClick={() => choosePatient(p)}>
                  <strong>{p.fullName}</strong>
                  <Muted>
                    {p.patientCode} · {p.phone}
                    {p.birthDate ? ` · ${p.birthDate.slice(0, 4)}` : ''}
                  </Muted>
                  <Muted>
                    <AddressText
                      regionCode={p.regionCode}
                      districtCode={p.districtCode}
                      fallback={p.city}
                    />
                  </Muted>
                </ResultRow>
              ))}
            </Results>
          )}
        </Card>
      )}

      {step === 2 && patient && (
        <>
          <Card>
            <PatientHead>
              <div>
                <strong>{patient.fullName}</strong>
                <Muted>
                  {patient.patientCode} · {patient.phone}
                </Muted>
              </div>
              <Btn $variant="secondary" onClick={() => setStep(1)}>
                {t('register.changePatient')}
              </Btn>
            </PatientHead>

            <Label>{t('register.case')}</Label>
            <CaseList>
              {cases.map((c) => (
                <CaseOption key={c.id} $active={caseId === c.id}>
                  <input
                    type="radio"
                    checked={caseId === c.id}
                    onChange={() => {
                      setCaseId(c.id);
                      setLines([]);
                    }}
                  />
                  <span>
                    {c.caseNumber} · {t(`cases.status.${c.status}`)}
                    {c.doctor ? ` · ${c.doctor.fullName}` : ''}
                    {c.followUpFreeUntil && (
                      <FreeHint>
                        {t('register.followUpFreeUntil', {
                          date: format(new Date(c.followUpFreeUntil), 'dd.MM.yyyy'),
                        })}
                      </FreeHint>
                    )}
                  </span>
                </CaseOption>
              ))}
              <CaseOption $active={caseId === ''}>
                <input
                  type="radio"
                  checked={caseId === ''}
                  onChange={() => {
                    setCaseId('');
                    setLines([]);
                  }}
                />
                <span>{t('register.newCase')}</span>
              </CaseOption>
            </CaseList>
          </Card>

          {theCase && theCase.referrals.length > 0 && (
            <Card>
              <SectionTitle>{t('register.referrals')}</SectionTitle>
              {theCase.referrals.map((r) => {
                const inOrder = lines.some((l) => l.referralId === r.id);
                const isCourse = r.service.kind === 'PROCEDURE' && r.remaining > 1;
                const today = Math.min(r.perDay ?? 1, r.remaining);
                return (
                  <ReferralRow key={r.id}>
                    <div>
                      <strong>{r.service.name}</strong>
                      <Muted>
                        {t('register.remaining', { n: r.remaining, total: r.quantity })}
                        {r.perDay && r.days
                          ? ` · ${t('register.perDay', { perDay: r.perDay, days: r.days })}`
                          : ''}
                        {r.doctor ? ` · ${r.doctor.fullName}` : ''}
                      </Muted>
                      {r.instructions && <Muted>{r.instructions}</Muted>}
                    </div>
                    <RowBtns>
                      {isCourse ? (
                        <>
                          <Btn
                            $variant="secondary"
                            disabled={inOrder}
                            onClick={() => addReferral(r, today, false)}
                          >
                            {t('register.today', { n: today })}
                          </Btn>
                          <Btn
                            $variant="primary"
                            disabled={inOrder}
                            onClick={() => addReferral(r, r.remaining, true)}
                          >
                            {t('register.fullCourse', { n: r.remaining })}
                          </Btn>
                        </>
                      ) : (
                        <Btn
                          $variant="primary"
                          disabled={inOrder}
                          onClick={() => addReferral(r, r.remaining, false)}
                        >
                          <Plus size={14} />
                          {t('common.add')}
                        </Btn>
                      )}
                    </RowBtns>
                  </ReferralRow>
                );
              })}
            </Card>
          )}

          <Card>
            <SectionTitle>{t('register.order')}</SectionTitle>
            <SearchBox>
              <Search size={15} />
              <input
                placeholder={t('appointments.searchService')}
                value={serviceQ}
                onChange={(e) => setServiceQ(e.target.value)}
              />
            </SearchBox>
            {catalog.length === 0 ? (
              <Empty>{t('services.noServices')}</Empty>
            ) : (
              <CatalogGrid>
                {catalog.map((s) => {
                  const type = typeOf(s);
                  return (
                    <CatalogCard
                      key={s.id}
                      name={s.name}
                      image={s.image}
                      typeLabel={type.label}
                      typeColor={type.color}
                      price={money(Number(s.price))}
                      addLabel={t('common.add')}
                      onAdd={() => addService(s)}
                    />
                  );
                })}
              </CatalogGrid>
            )}

            {lines.length === 0 ? (
              <Empty>{t('appointments.noItemsAdded')}</Empty>
            ) : (
              <Paged rows={lines}>
                {(pageRows) => (
                  <Table>
                    <thead>
                      <tr>
                        <Th>{t('services.name')}</Th>
                        <Th>{t('appointments.doctor')}</Th>
                        <Th>{t('appointments.quantity')}</Th>
                        <Th>{t('register.discount')}</Th>
                        <Th style={{ textAlign: 'right' }}>{t('appointments.subtotal')}</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((l) => {
                        const s = serviceById.get(l.serviceId);
                        const ql = quoted(l.key);
                        const course = discountAllowed(l);
                        return (
                          <tr key={l.key}>
                            <Td>
                              <WithThumb>
                                {s?.image && <ServiceThumb src={s.image} alt="" $size={28} />}
                                <span>{s?.name ?? '—'}</span>
                              </WithThumb>
                              <Muted>
                                {s ? typeOf(s).label : ''}
                                {l.referralId ? ` · ${t('register.fromReferral')}` : ''}
                              </Muted>
                            </Td>
                            <Td>
                              {s?.kind === 'CONSULTATION' ? (
                                <Select
                                  value={l.doctorId ?? ''}
                                  onChange={(e) =>
                                    patch(l.key, { doctorId: e.target.value || null })
                                  }
                                >
                                  <option value="">{t('appointments.selectDoctor')}</option>
                                  {doctors.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.fullName}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <Muted>{t('register.noDoctor')}</Muted>
                              )}
                            </Td>
                            <Td>
                              <Qty
                                type="number"
                                min={1}
                                value={l.quantity}
                                onChange={(e) =>
                                  patch(l.key, {
                                    quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                  })
                                }
                              />
                            </Td>
                            <Td>
                              {course ? (
                                <CourseCell>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={l.fullCourse === true}
                                      onChange={(e) =>
                                        patch(l.key, { fullCourse: e.target.checked })
                                      }
                                    />{' '}
                                    {t('register.paidUpfront')}
                                  </label>
                                  {l.fullCourse && (
                                    <span>
                                      <Qty
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={l.discountPercent ?? 0}
                                        onChange={(e) =>
                                          patch(l.key, {
                                            discountPercent: Math.min(
                                              100,
                                              Math.max(0, Number(e.target.value) || 0),
                                            ),
                                          })
                                        }
                                      />{' '}
                                      %
                                    </span>
                                  )}
                                </CourseCell>
                              ) : (
                                <Muted>—</Muted>
                              )}
                            </Td>
                            <Td style={{ textAlign: 'right' }}>
                              {ql ? (
                                <>
                                  {ql.unitPrice === 0 && s?.isFollowUp ? (
                                    <FreeHint>{t('register.free')}</FreeHint>
                                  ) : (
                                    money(ql.total)
                                  )}
                                  {ql.discount > 0 && <Muted>−{money(ql.discount)}</Muted>}
                                </>
                              ) : (
                                '…'
                              )}
                            </Td>
                            <Td>
                              <IconBtn
                                onClick={() => remove(l.key)}
                                aria-label={t('common.delete')}
                              >
                                <Trash2 size={14} />
                              </IconBtn>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </Paged>
            )}

            {quoteError && (
              <Problem role="alert">
                {t(quoteError)}
                {quoteError === 'errors.discountNeedsAdmin' && (
                  <Btn $variant="secondary" onClick={() => setAskApproval(true)}>
                    <ShieldCheck size={14} />
                    {t('register.askAdmin')}
                  </Btn>
                )}
              </Problem>
            )}

            {quote && (
              <TotalRow>
                {quote.discountAmount > 0 && (
                  <Muted>
                    {t('register.discount')}: −{money(quote.discountAmount)}
                  </Muted>
                )}
                {quote.needsAdminApproval && <Muted>{t('register.approvalChecked')}</Muted>}
                <strong>
                  {t('common.total')}: {money(quote.totalAmount)}
                </strong>
              </TotalRow>
            )}

            <Footer>
              <Btn
                $variant="primary"
                disabled={!quote || saving || lines.length === 0}
                onClick={save}
              >
                {saving
                  ? t('common.processing')
                  : quote && quote.totalAmount === 0
                    ? t('register.registerFree')
                    : t('register.toPayment')}
              </Btn>
            </Footer>
          </Card>
        </>
      )}

      {askApproval && (
        <ApprovalDialog
          onCancel={() => setAskApproval(false)}
          onApprove={(a) => {
            setApproval(a);
            setAskApproval(false);
          }}
        />
      )}
    </Page>
  );
}

/** An admin types their phone + password on the receptionist's till to allow a bigger discount. */
function ApprovalDialog({
  onCancel,
  onApprove,
}: {
  onCancel: () => void;
  onApprove: (a: { phone: string; password: string }) => void;
}) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <Dialog role="dialog" aria-modal="true">
        <SectionTitle>{t('register.adminApproval')}</SectionTitle>
        <Muted>{t('register.adminApprovalHint')}</Muted>
        <Label>{t('auth.phone')}</Label>
        <PhoneInput value={phone} onChange={setPhone} autoFocus />
        <Label>{t('auth.password')}</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Footer>
          <Btn $variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Btn>
          <Btn
            $variant="primary"
            disabled={!phone || !password}
            onClick={() => onApprove({ phone, password })}
          >
            {t('register.approve')}
          </Btn>
        </Footer>
      </Dialog>
    </Overlay>
  );
}

// ── styles (theme tokens) ───────────────────────────────────────────────────────────────────

const Page = styled.div`
  max-width: 1440px;
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
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;
const Steps = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;
const StepTab = styled.button<{ $active: boolean; $done: boolean }>`
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active, $done }) =>
    $active ? '#fff' : $done ? theme.colors.primary : theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;
const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;
const SectionTitle = styled.h2`
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.spacing.sm};
`;
const SearchRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`;
const SearchBox = styled.label`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  input {
    flex: 1;
    border: 0;
    outline: none;
    background: transparent;
    padding: 10px 0;
    font-size: 14px;
    color: ${({ theme }) => theme.colors.text};
  }
  &:focus-within {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;
const Filters = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md} 0;
`;
const Row2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;
const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin: ${({ theme }) => theme.spacing.sm} 0 4px;
`;
const Input = styled.input`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;
const Select = styled.select`
  width: 100%;
  min-width: 140px;
  padding: 7px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
`;
const Qty = styled.input`
  width: 64px;
  padding: 6px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
`;
const Results = styled.div`
  display: grid;
  gap: 4px;
  max-height: 380px;
  overflow-y: auto;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;
const ResultRow = styled.button`
  display: grid;
  gap: 2px;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.colors.primary};
    outline: none;
  }
`;
const Muted = styled.span`
  display: block;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const Empty = styled.p`
  padding: ${({ theme }) => theme.spacing.lg} 0;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const PatientHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;
const CaseList = styled.div`
  display: grid;
  gap: 6px;
`;
const CaseOption = styled.label<{ $active: boolean }>`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
`;
const FreeHint = styled.span`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.success};
`;
const ReferralRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: 10px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
`;
const RowBtns = styled.div`
  display: flex;
  gap: 6px;
  flex-shrink: 0;
`;
const CatalogGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
  max-height: 460px;
  overflow-y: auto;
  padding: 2px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;
const ListTitle = styled.h3`
  margin: ${({ theme }) => theme.spacing.sm} 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const RowHead = styled.span`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
`;
const WithThumb = styled.span`
  display: flex;
  align-items: center;
  gap: 10px;
`;
const ServiceThumb = styled.img<{ $size: number; $round?: boolean }>`
  flex: none;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  object-fit: cover;
  border-radius: ${({ $round, theme }) => ($round ? '999px' : theme.borderRadius)};
  background: ${({ theme }) => theme.colors.background};
`;
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;
const Th = styled.th`
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 8px 6px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;
const Td = styled.td`
  padding: 8px 6px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: top;
`;
const CourseCell = styled.div`
  display: grid;
  gap: 4px;
  font-size: 12px;
`;
const IconBtn = styled.button`
  border: 0;
  background: none;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  padding: 4px;
`;
const Problem = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
`;
const TotalRow = styled.div`
  display: grid;
  justify-items: end;
  gap: 2px;
  margin-top: ${({ theme }) => theme.spacing.md};
  font-size: 16px;
  color: ${({ theme }) => theme.colors.text};
`;
const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.md};
`;
const Btn = styled.button<{ $variant: 'primary' | 'secondary' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid
    ${({ theme, $variant }) =>
      $variant === 'primary' ? theme.colors.primary : theme.colors.border};
  background: ${({ theme, $variant }) =>
    $variant === 'primary' ? theme.colors.primary : theme.colors.surface};
  color: ${({ theme, $variant }) => ($variant === 'primary' ? '#fff' : theme.colors.text)};
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
  z-index: 50;
`;
const Dialog = styled.div`
  width: 360px;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;
