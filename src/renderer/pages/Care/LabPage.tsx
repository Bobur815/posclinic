import { format } from 'date-fns';
import { Check, FileText, TestTube } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { LabQueueDto, ResultInput } from '../../../shared/clinic';
import { useToast } from '../../context/ToastContext';
import { useDataVersion } from '../../hooks/useDataVersion';
import { ipcErrorKey } from '../../store/lan-store';
import { ageOf } from './care-format';
import {
  Actions,
  Btn,
  Card,
  CardTitle,
  Empty,
  Input,
  Muted,
  Page,
  Row,
  Select,
  StatusBadge,
  Title,
} from './care-ui';

type Analysis = LabQueueDto['analyses'][number];

/**
 * Lab and procedures (v2.5): paid analyses (take the sample, enter the result in the shape the
 * service asks for) and course sessions due up to today (tick each one). Works on any till:
 * a nurse's PC if there is one, otherwise reception or the doctor's.
 */
export function LabPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [lab, setLab] = useState<LabQueueDto | null>(null);
  const [failed, setFailed] = useState(false);
  const version = useDataVersion(['appointments', 'cases']);
  const load = useCallback(() => {
    window.electronAPI.queue
      .listLab()
      .then((r) => {
        setLab(r);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load, version]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
      return true;
    } catch (e) {
      toast.error(t(ipcErrorKey(e, 'common.error')));
      return false;
    }
  };

  const who = (p: Analysis['appointment']['patient']) => {
    const age = ageOf(p.birthDate);
    return (
      <>
        <strong>{p.fullName}</strong>
        <Muted>
          {p.patientCode}
          {age !== null ? ` · ${t('care.years', { n: age })}` : ''}
        </Muted>
      </>
    );
  };

  if (failed) {
    return (
      <Page>
        <Title>{t('nav.lab')}</Title>
        <Card>
          <Empty>
            {t('common.error')} <Btn onClick={load}>{t('address.retry')}</Btn>
          </Empty>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Title>{t('nav.lab')}</Title>

      <Card>
        <CardTitle>
          <span>
            <TestTube size={15} /> {t('lab.analyses')}
          </span>
          {lab && <Muted>{t('care.waitingCount', { n: lab.analyses.length })}</Muted>}
        </CardTitle>
        {!lab ? (
          <Empty>{t('common.loading')}</Empty>
        ) : lab.analyses.length === 0 ? (
          <Empty>{t('lab.noAnalyses')}</Empty>
        ) : (
          lab.analyses.map((a) => (
            <AnalysisRow
              key={a.id}
              a={a}
              who={who(a.appointment.patient)}
              onSample={() => run(() => window.electronAPI.results.sampleTaken(a.id))}
              onSave={(r) => run(() => window.electronAPI.results.save(a.id, r))}
              onOpen={() => a.appointment.caseId && navigate(`/cases/${a.appointment.caseId}`)}
            />
          ))
        )}
      </Card>

      <Card>
        <CardTitle>
          <span>{t('lab.sessionsToday')}</span>
          {lab && <Muted>{t('care.waitingCount', { n: lab.sessions.length })}</Muted>}
        </CardTitle>
        {!lab ? (
          <Empty>{t('common.loading')}</Empty>
        ) : lab.sessions.length === 0 ? (
          <Empty>{t('lab.noSessions')}</Empty>
        ) : (
          lab.sessions.map((s) => {
            const overdue =
              s.plannedDate &&
              new Date(s.plannedDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
            return (
              <Row key={s.id}>
                <div style={{ flex: 1 }}>{who(s.item.appointment.patient)}</div>
                <div style={{ flex: 1 }}>
                  {s.item.serviceName}
                  <Muted>
                    {t('lab.sessionOf', { n: s.number, total: s.item.quantity })} ·{' '}
                    {t('care.sessionsDone', {
                      done: s.item._count.sessions,
                      total: s.item.quantity,
                    })}
                    {s.plannedDate ? ` · ${format(new Date(s.plannedDate), 'dd.MM')}` : ''}
                  </Muted>
                </div>
                {overdue && <StatusBadge $status="WAITING_DOCTOR">{t('lab.overdue')}</StatusBadge>}
                <Btn
                  $variant="primary"
                  onClick={() => run(() => window.electronAPI.sessions.tick(s.id))}
                >
                  <Check size={14} />
                  {t('lab.done')}
                </Btn>
              </Row>
            );
          })
        )}
      </Card>
      <Muted>{t('lab.undoHint')}</Muted>
    </Page>
  );
}

function AnalysisRow({
  a,
  who,
  onSample,
  onSave,
  onOpen,
}: {
  a: Analysis;
  who: ReactNode;
  onSample: () => void;
  onSave: (r: ResultInput) => Promise<boolean>;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const type = a.service.resultType ?? 'QUALITATIVE';
  const sampled = a.results[0]?.sampleTakenAt;
  const [outcome, setOutcome] = useState<'' | 'POSITIVE' | 'NEGATIVE'>('');
  const [value, setValue] = useState('');
  const [finding, setFinding] = useState('');
  const [comment, setComment] = useState('');
  const ready =
    type === 'QUALITATIVE'
      ? outcome !== ''
      : type === 'QUANTITATIVE'
        ? value.trim() !== ''
        : !!(finding || comment);

  return (
    <Row style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 180 }}>{who}</div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <strong>{a.serviceName}</strong>
        <Muted>
          {sampled
            ? t('lab.sampleTakenAt', { time: format(new Date(sampled), 'HH:mm') })
            : t('care.sampleWaiting')}
          {a.service.referenceRange
            ? ` · ${t('services.referenceRange')}: ${a.service.referenceRange}`
            : ''}
        </Muted>
        {sampled && (
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            {type === 'QUALITATIVE' && (
              <Select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as typeof outcome)}
              >
                <option value="">{t('lab.chooseOutcome')}</option>
                <option value="POSITIVE">{t('care.outcome.POSITIVE')}</option>
                <option value="NEGATIVE">{t('care.outcome.NEGATIVE')}</option>
              </Select>
            )}
            {type === 'QUANTITATIVE' && (
              <Input
                inputMode="decimal"
                placeholder={a.service.resultUnit ?? t('lab.value')}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            <Input
              placeholder={t('lab.finding')}
              value={finding}
              onChange={(e) => setFinding(e.target.value)}
            />
            <Input
              placeholder={t('lab.comment')}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        )}
      </div>
      <Actions>
        {a.appointment.caseId && (
          <Btn onClick={onOpen} aria-label={t('care.openCase')}>
            <FileText size={14} />
          </Btn>
        )}
        {!sampled ? (
          <Btn $variant="primary" onClick={onSample}>
            <TestTube size={14} />
            {t('lab.sampleTaken')}
          </Btn>
        ) : (
          <Btn
            $variant="primary"
            disabled={!ready}
            onClick={() =>
              onSave({
                ...(type === 'QUALITATIVE' && outcome ? { outcome } : {}),
                ...(type === 'QUANTITATIVE' ? { value: Number(value.replace(',', '.')) } : {}),
                finding,
                comment,
              })
            }
          >
            <Check size={14} />
            {t('lab.saveResult')}
          </Btn>
        )}
      </Actions>
    </Row>
  );
}

