import { format } from 'date-fns';
import { DoorOpen, FileText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { QueueItemDto } from '../../../shared/clinic';
import { useToast } from '../../context/ToastContext';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useAuthStore } from '../../store/auth-store';
import { ipcErrorKey } from '../../store/lan-store';
import { ageOf } from './care-format';
import {
  Actions,
  Btn,
  Card,
  CardTitle,
  Empty,
  Muted,
  Page,
  Row,
  StatusBadge,
  Title,
} from './care-ui';

/**
 * A doctor: "My queue", the paid consultations waiting for them, oldest first; "Call in" takes
 * one, "Open" goes to the case. Everyone else: the board of who waits for whom (each doctor,
 * analyses, procedures). Updates live from any till (data:changed).
 */
export function QueuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const role = useAuthStore((s) => s.user?.role);
  const isDoctor = role === 'DOCTOR';
  const [items, setItems] = useState<QueueItemDto[] | null>(null);
  const [error, setError] = useState(false);

  const version = useDataVersion(['appointments', 'cases']);
  const load = useCallback(() => {
    const call = isDoctor
      ? window.electronAPI.queue.listMine
      : window.electronAPI.queue.listOverview;
    call()
      .then((r) => {
        setItems(r);
        setError(false);
      })
      .catch(() => setError(true));
  }, [isDoctor]);
  useEffect(() => {
    load();
  }, [load, version]);

  const open = (i: QueueItemDto) => {
    if (i.appointment.caseId) navigate(`/cases/${i.appointment.caseId}?item=${i.id}`);
  };
  const callIn = async (i: QueueItemDto) => {
    try {
      if (i.status === 'WAITING') await window.electronAPI.queue.start(i.id);
      open(i);
    } catch (e) {
      toast.error(t(ipcErrorKey(e, 'common.error')));
    }
  };

  const patientLine = (i: QueueItemDto) => {
    const p = i.appointment.patient;
    const age = ageOf(p.birthDate);
    return (
      <div>
        <strong>{p.fullName}</strong>
        <Muted>
          {p.patientCode}
          {age !== null ? ` · ${t('care.years', { n: age })}` : ''}
          {p.gender ? ` · ${t(`common.${p.gender.toLowerCase()}`)}` : ''}
          {` · ${i.serviceName}`}
          {` · ${format(new Date(i.appointment.createdAt), 'HH:mm')}`}
        </Muted>
      </div>
    );
  };

  if (error) {
    return (
      <Page>
        <Title>{isDoctor ? t('nav.myQueue') : t('nav.queue')}</Title>
        <Card>
          <Empty>
            {t('common.error')} <Btn onClick={load}>{t('address.retry')}</Btn>
          </Empty>
        </Card>
      </Page>
    );
  }

  if (isDoctor) {
    return (
      <Page>
        <Title>{t('nav.myQueue')}</Title>
        <Card>
          {items === null ? (
            <Empty>{t('common.loading')}</Empty>
          ) : items.length === 0 ? (
            <Empty>{t('care.queueEmpty')}</Empty>
          ) : (
            items.map((i, n) => (
              <Row key={i.id}>
                <span style={{ width: 28, fontWeight: 700 }}>{n + 1}</span>
                <div style={{ flex: 1 }}>{patientLine(i)}</div>
                <StatusBadge $status={i.status}>{t(`care.itemStatus.${i.status}`)}</StatusBadge>
                <Actions>
                  {i.status === 'WAITING' ? (
                    <Btn $variant="primary" onClick={() => callIn(i)}>
                      <DoorOpen size={14} />
                      {t('care.callIn')}
                    </Btn>
                  ) : (
                    <Btn $variant="primary" onClick={() => open(i)}>
                      <FileText size={14} />
                      {t('care.openCase')}
                    </Btn>
                  )}
                </Actions>
              </Row>
            ))
          )}
        </Card>
      </Page>
    );
  }

  // The board: one card per doctor, then analyses and procedures.
  const groups = new Map<string, { title: string; items: QueueItemDto[] }>();
  for (const i of items ?? []) {
    const key =
      i.service.kind === 'CONSULTATION' ? `d:${i.doctor?.id ?? '-'}` : `k:${i.service.kind}`;
    const title =
      i.service.kind === 'CONSULTATION'
        ? (i.doctor?.fullName ?? t('register.noDoctor'))
        : t(`care.queueOf.${i.service.kind}`);
    const g = groups.get(key) ?? { title, items: [] };
    g.items.push(i);
    groups.set(key, g);
  }

  return (
    <Page>
      <Title>{t('nav.queue')}</Title>
      {items === null ? (
        <Card>
          <Empty>{t('common.loading')}</Empty>
        </Card>
      ) : groups.size === 0 ? (
        <Card>
          <Empty>{t('care.boardEmpty')}</Empty>
        </Card>
      ) : (
        [...groups.entries()].map(([key, g]) => (
          <Card key={key}>
            <CardTitle>
              {g.title}
              <Muted>{t('care.waitingCount', { n: g.items.length })}</Muted>
            </CardTitle>
            {g.items.map((i) => (
              <Row key={i.id}>
                <div style={{ flex: 1 }}>{patientLine(i)}</div>
                <StatusBadge $status={i.status}>{t(`care.itemStatus.${i.status}`)}</StatusBadge>
                {i.appointment.caseId && (
                  <Btn onClick={() => open(i)}>
                    <FileText size={14} />
                    {t('care.openCase')}
                  </Btn>
                )}
              </Row>
            ))}
          </Card>
        ))
      )}
    </Page>
  );
}
