import { format } from 'date-fns';
import { ArrowLeft, CheckCircle2, FlaskConical, Lock, Save, Unlock, X } from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { CaseDetailDto, ServiceDto, VitalsInput } from '../../../shared/clinic';
import { useToast } from '../../context/ToastContext';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useAuthStore } from '../../store/auth-store';
import { ipcErrorKey } from '../../store/lan-store';
import { ageOf, vitalsLine } from './care-format';
import {
  Actions,
  Btn,
  Card,
  CardTitle,
  Empty,
  Grid,
  Input,
  Label,
  Muted,
  Page,
  Row,
  Select,
  StatusBadge,
  Textarea,
  Title,
} from './care-ui';

/**
 * One patient journey (v2.5): who the patient is (allergies, chronic conditions, latest vitals),
 * complaint and diagnosis, this visit's vitals, the doctor's referrals back to reception,
 * analysis results, and every order with its lines and course sessions. A doctor (or admin)
 * edits; reception sees it and can record vitals. Main enforces who may do what.
 */
export function CasePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { id = '' } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const role = useAuthStore((s) => s.user?.role);
  const canDecide = role === 'DOCTOR' || role === 'CLINIC_ADMIN' || role === 'SUPER_ADMIN';

  const [c, setC] = useState<CaseDetailDto | null>(null);
  const [failed, setFailed] = useState(false);
  const version = useDataVersion(['cases', 'appointments', 'patients']);
  const load = useCallback(() => {
    window.electronAPI.cases
      .get(id)
      .then((r) => {
        setC(r);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [id]);
  useEffect(() => {
    load();
  }, [load, version]);

  const run = async (fn: () => Promise<unknown>, ok = true) => {
    try {
      await fn();
      if (ok) toast.success(t('common.success'));
      load();
      return true;
    } catch (e) {
      const key = ipcErrorKey(e, 'common.error');
      if (!key.startsWith('license.')) toast.error(t(key));
      return false;
    }
  };

  if (failed) {
    return (
      <Page>
        <Card>
          <Empty>{t('errors.notFound')}</Empty>
        </Card>
      </Page>
    );
  }
  if (!c) {
    return (
      <Page>
        <Empty>{t('common.loading')}</Empty>
      </Page>
    );
  }

  const p = c.patient;
  const age = ageOf(p.birthDate);
  const closed = c.status === 'CLOSED';
  // Consultation lines of this case still open: the doctor finishes the one they came from.
  const openConsults = c.appointments
    .flatMap((a) => a.items.map((i) => ({ ...i, paid: a.paymentStatus !== 'PENDING' })))
    .filter(
      (i) =>
        i.service.kind === 'CONSULTATION' && (i.status === 'WAITING' || i.status === 'IN_PROGRESS'),
    );
  const current = openConsults.find((i) => i.id === params.get('item')) ?? openConsults[0];

  return (
    <Page>
      <Btn onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} />
        {t('common.back')}
      </Btn>

      <Card>
        <CardTitle>
          <span>
            {p.fullName}
            <Muted>
              {p.patientCode} · {p.phone}
              {age !== null ? ` · ${t('care.years', { n: age })}` : ''}
              {p.gender ? ` · ${t(`common.${p.gender.toLowerCase()}`)}` : ''}
              {p.bloodType ? ` · ${p.bloodType}` : ''}
            </Muted>
          </span>
          <Actions>
            <StatusBadge $status={c.status}>{t(`cases.status.${c.status}`)}</StatusBadge>
            {canDecide && current && current.paid && (
              <Btn
                $variant="primary"
                onClick={() =>
                  run(() => window.electronAPI.queue.finish(current.id)).then(
                    (ok) => ok && role === 'DOCTOR' && navigate('/queue'),
                  )
                }
              >
                <CheckCircle2 size={14} />
                {t('care.finishConsultation')}
              </Btn>
            )}
            {canDecide &&
              (closed ? (
                <Btn
                  onClick={() => run(() => window.electronAPI.cases.update(c.id, { reopen: true }))}
                >
                  <Unlock size={14} />
                  {t('care.reopenCase')}
                </Btn>
              ) : (
                <Btn
                  onClick={() => run(() => window.electronAPI.cases.update(c.id, { close: true }))}
                >
                  <Lock size={14} />
                  {t('care.closeCase')}
                </Btn>
              ))}
          </Actions>
        </CardTitle>
        <Muted>
          {c.caseNumber} · {format(new Date(c.openedAt), 'dd.MM.yyyy')}
          {c.doctor ? ` · ${c.doctor.fullName}` : ''}
        </Muted>
        <MedicalFields patient={p} editable={canDecide} onSaved={load} />
        <Muted style={{ marginTop: 8 }}>
          {t('care.latestVitals')}: {vitalsLine(c.latestVitals, t)}
        </Muted>
      </Card>

      <Grid $cols={2}>
        <ComplaintDiagnosis caseDetail={c} editable={canDecide && !closed} onSave={run} />
        <VitalsCard caseDetail={c} disabled={closed} onSave={run} />
      </Grid>

      <ReferralsCard caseDetail={c} editable={canDecide && !closed} onRun={run} />

      <Card>
        <CardTitle>
          <span>
            <FlaskConical size={15} /> {t('care.results')}
          </span>
        </CardTitle>
        {c.analysisResults.length === 0 ? (
          <Empty>{t('care.noResults')}</Empty>
        ) : (
          c.analysisResults.map((r) => (
            <Row key={r.id}>
              <div>
                <strong>{r.service.name}</strong>
                <Muted>
                  {r.outcome ? t(`care.outcome.${r.outcome}`) : ''}
                  {r.value !== null ? ` ${r.value} ${r.unit ?? ''}` : ''}
                  {r.finding ? ` · ${r.finding}` : ''}
                  {r.comment ? ` · ${r.comment}` : ''}
                </Muted>
              </div>
              <Muted>
                {r.confirmedAt
                  ? t('care.confirmed')
                  : r.enteredAt
                    ? t('care.awaitingConfirmation')
                    : t('care.sampleWaiting')}
              </Muted>
            </Row>
          ))
        )}
      </Card>

      <Card>
        <CardTitle>{t('care.history')}</CardTitle>
        {c.appointments.map((a) => (
          <div key={a.id} style={{ marginBottom: 10 }}>
            <Muted>
              {format(new Date(a.appointmentDate), 'dd.MM.yyyy HH:mm')} · {a.appointmentNumber} ·{' '}
              {t(`payment.status.${a.paymentStatus}`, { defaultValue: a.paymentStatus })}
            </Muted>
            {a.items.map((i) => {
              const done = i.sessions.filter((s) => s.doneAt).length;
              return (
                <Row key={i.id}>
                  <div>
                    {i.serviceName}
                    {i.quantity > 1 ? ` × ${i.quantity}` : ''}
                    {i.doctor ? <Muted>{i.doctor.fullName}</Muted> : null}
                  </div>
                  <Actions>
                    {i.sessions.length > 0 && (
                      <Muted>{t('care.sessionsDone', { done, total: i.sessions.length })}</Muted>
                    )}
                    <StatusBadge $status={i.status}>{t(`care.itemStatus.${i.status}`)}</StatusBadge>
                  </Actions>
                </Row>
              );
            })}
          </div>
        ))}
      </Card>

      {c.otherCases.length > 0 && (
        <Card>
          <CardTitle>{t('care.otherCases')}</CardTitle>
          {c.otherCases.map((o) => (
            <Row key={o.id}>
              <div>
                {o.caseNumber} · {format(new Date(o.openedAt), 'dd.MM.yyyy')}
                {o.diagnosis ? <Muted>{o.diagnosis}</Muted> : null}
              </div>
              <Actions>
                <StatusBadge $status={o.status}>{t(`cases.status.${o.status}`)}</StatusBadge>
                <Btn onClick={() => navigate(`/cases/${o.id}`)}>{t('care.openCase')}</Btn>
              </Actions>
            </Row>
          ))}
        </Card>
      )}
    </Page>
  );
}

type Run = (fn: () => Promise<unknown>, ok?: boolean) => Promise<boolean>;

function MedicalFields({
  patient,
  editable,
  onSaved,
}: {
  patient: CaseDetailDto['patient'];
  editable: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [allergies, setAllergies] = useState(patient.allergies ?? '');
  const [chronic, setChronic] = useState(patient.chronicConditions ?? '');
  useEffect(() => {
    setAllergies(patient.allergies ?? '');
    setChronic(patient.chronicConditions ?? '');
  }, [patient.allergies, patient.chronicConditions]);
  const dirty =
    allergies !== (patient.allergies ?? '') || chronic !== (patient.chronicConditions ?? '');

  if (!editable) {
    return (
      <Grid $cols={2} style={{ marginTop: 10 }}>
        <Label>
          {t('patients.allergies')}
          <span>{patient.allergies || '—'}</span>
        </Label>
        <Label>
          {t('care.chronicConditions')}
          <span>{patient.chronicConditions || '—'}</span>
        </Label>
      </Grid>
    );
  }
  return (
    <Grid $cols={2} style={{ marginTop: 10 }}>
      <Label>
        {t('patients.allergies')}
        <Input value={allergies} onChange={(e) => setAllergies(e.target.value)} />
      </Label>
      <Label>
        {t('care.chronicConditions')}
        <Input value={chronic} onChange={(e) => setChronic(e.target.value)} />
      </Label>
      {dirty && (
        <div>
          <Btn
            $variant="primary"
            onClick={async () => {
              try {
                await window.electronAPI.patients.update(patient.id, {
                  allergies,
                  chronicConditions: chronic,
                });
                toast.success(t('common.success'));
                onSaved();
              } catch (e) {
                toast.error(t(ipcErrorKey(e, 'common.error')));
              }
            }}
          >
            <Save size={14} />
            {t('common.save')}
          </Btn>
        </div>
      )}
    </Grid>
  );
}

function ComplaintDiagnosis({
  caseDetail: c,
  editable,
  onSave,
}: {
  caseDetail: CaseDetailDto;
  editable: boolean;
  onSave: Run;
}) {
  const { t } = useTranslation();
  const [complaint, setComplaint] = useState(c.complaint ?? '');
  const [diagnosis, setDiagnosis] = useState(c.diagnosis ?? '');
  useEffect(() => {
    setComplaint(c.complaint ?? '');
    setDiagnosis(c.diagnosis ?? '');
  }, [c.complaint, c.diagnosis]);
  const dirty = complaint !== (c.complaint ?? '') || diagnosis !== (c.diagnosis ?? '');
  return (
    <Card>
      <CardTitle>{t('care.examination')}</CardTitle>
      <Label>
        {t('care.complaint')}
        <Textarea
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          disabled={!editable}
        />
      </Label>
      <Label style={{ marginTop: 8 }}>
        {t('appointments.diagnosis')}
        <Textarea
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          disabled={!editable}
        />
      </Label>
      {editable && dirty && (
        <Btn
          $variant="primary"
          style={{ marginTop: 8 }}
          onClick={() =>
            onSave(() => window.electronAPI.cases.update(c.id, { complaint, diagnosis }))
          }
        >
          <Save size={14} />
          {t('common.save')}
        </Btn>
      )}
    </Card>
  );
}

function VitalsCard({
  caseDetail: c,
  disabled,
  onSave,
}: {
  caseDetail: CaseDetailDto;
  disabled: boolean;
  onSave: Run;
}) {
  const { t } = useTranslation();
  const empty = { heightCm: '', weightKg: '', temperature: '', bpSystolic: '', bpDiastolic: '' };
  const [v, setV] = useState(empty);
  const [pregnant, setPregnant] = useState(false);
  const n = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  const set = (k: keyof typeof empty) => (e: ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.value });
  const anything = Object.values(v).some((x) => x.trim() !== '') || pregnant;

  const save = () => {
    const input: VitalsInput = {
      patientId: c.patientId,
      caseId: c.id,
      heightCm: n(v.heightCm),
      weightKg: n(v.weightKg),
      temperature: n(v.temperature),
      bpSystolic: n(v.bpSystolic),
      bpDiastolic: n(v.bpDiastolic),
      pregnant: c.patient.gender === 'FEMALE' ? pregnant : null,
    };
    onSave(() => window.electronAPI.cases.recordVitals(input)).then((ok) => {
      if (ok) {
        setV(empty);
        setPregnant(false);
      }
    });
  };

  return (
    <Card>
      <CardTitle>{t('care.vitals')}</CardTitle>
      <Grid $cols={3}>
        <Label>
          {t('care.height')}
          <Input
            inputMode="decimal"
            value={v.heightCm}
            onChange={set('heightCm')}
            disabled={disabled}
          />
        </Label>
        <Label>
          {t('care.weight')}
          <Input
            inputMode="decimal"
            value={v.weightKg}
            onChange={set('weightKg')}
            disabled={disabled}
          />
        </Label>
        <Label>
          {t('care.temperature')}
          <Input
            inputMode="decimal"
            value={v.temperature}
            onChange={set('temperature')}
            disabled={disabled}
          />
        </Label>
        <Label>
          {t('care.bpSystolic')}
          <Input
            inputMode="numeric"
            value={v.bpSystolic}
            onChange={set('bpSystolic')}
            disabled={disabled}
          />
        </Label>
        <Label>
          {t('care.bpDiastolic')}
          <Input
            inputMode="numeric"
            value={v.bpDiastolic}
            onChange={set('bpDiastolic')}
            disabled={disabled}
          />
        </Label>
        {c.patient.gender === 'FEMALE' && (
          <Label>
            {t('care.pregnant')}
            <input
              type="checkbox"
              checked={pregnant}
              onChange={(e) => setPregnant(e.target.checked)}
            />
          </Label>
        )}
      </Grid>
      <Btn
        $variant="primary"
        style={{ marginTop: 8 }}
        disabled={disabled || !anything}
        onClick={save}
      >
        <Save size={14} />
        {t('care.recordVitals')}
      </Btn>
      {c.vitals.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {c.vitals.slice(0, 5).map((x) => (
            <Muted key={x.id}>
              {format(new Date(x.recordedAt), 'dd.MM HH:mm')} · {vitalsLine(x, t)}
            </Muted>
          ))}
        </div>
      )}
    </Card>
  );
}

function ReferralsCard({
  caseDetail: c,
  editable,
  onRun,
}: {
  caseDetail: CaseDetailDto;
  editable: boolean;
  onRun: Run;
}) {
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [perDay, setPerDay] = useState('1');
  const [days, setDays] = useState('5');
  const [instructions, setInstructions] = useState('');
  useEffect(() => {
    if (editable) window.electronAPI.services.getActive().then(setServices);
  }, [editable]);
  const offer = useMemo(() => services.filter((s) => s.kind !== 'CONSULTATION'), [services]);
  const chosen = offer.find((s) => s.id === serviceId);
  const isCourse = chosen?.kind === 'PROCEDURE';

  const add = () =>
    onRun(() =>
      window.electronAPI.cases.addReferral(c.id, {
        serviceId,
        ...(isCourse
          ? { perDay: Number(perDay), days: Number(days) }
          : { quantity: Number(quantity) || 1 }),
        instructions,
      }),
    ).then((ok) => {
      if (ok) {
        setServiceId('');
        setInstructions('');
      }
    });

  return (
    <Card>
      <CardTitle>{t('care.referrals')}</CardTitle>
      {c.referrals.length === 0 ? (
        <Empty>{t('care.noReferrals')}</Empty>
      ) : (
        c.referrals.map((r) => (
          <Row key={r.id}>
            <div>
              <strong>{r.service.name}</strong>
              <Muted>
                {r.perDay && r.days
                  ? t('register.perDay', { perDay: r.perDay, days: r.days })
                  : `× ${r.quantity}`}
                {` · ${t('register.remaining', { n: r.quantity - r.registeredQty, total: r.quantity })}`}
                {r.instructions ? ` · ${r.instructions}` : ''}
              </Muted>
            </div>
            <Actions>
              <StatusBadge $status={r.status}>{t(`care.referralStatus.${r.status}`)}</StatusBadge>
              {editable && (r.status === 'PENDING' || r.status === 'PARTIAL') && (
                <Btn
                  $variant="danger"
                  aria-label={t('common.cancel')}
                  onClick={() => onRun(() => window.electronAPI.cases.cancelReferral(r.id))}
                >
                  <X size={14} />
                </Btn>
              )}
            </Actions>
          </Row>
        ))
      )}
      {editable && (
        <Grid $cols={4} style={{ marginTop: 12, alignItems: 'end' }}>
          <Label style={{ gridColumn: 'span 2' }}>
            {t('care.referTo')}
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">—</option>
              {offer.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({t(`services.kinds.${s.kind}`)})
                </option>
              ))}
            </Select>
          </Label>
          {isCourse ? (
            <>
              <Label>
                {t('care.perDay')}
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={perDay}
                  onChange={(e) => setPerDay(e.target.value)}
                />
              </Label>
              <Label>
                {t('care.days')}
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </Label>
            </>
          ) : (
            <Label>
              {t('appointments.quantity')}
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Label>
          )}
          <Label style={{ gridColumn: '1 / -1' }}>
            {t('care.instructions')}
            <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </Label>
          <div>
            <Btn $variant="primary" disabled={!serviceId} onClick={add}>
              {t('care.sendToReception')}
            </Btn>
          </div>
        </Grid>
      )}
    </Card>
  );
}
