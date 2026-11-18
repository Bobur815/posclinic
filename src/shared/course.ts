/**
 * Treatment courses of a case, as the A4 sheet and the case page show them (v2.9).
 *
 * A course starts with the doctor's course referral ("2 a day for 5 days"): it has all its boxes
 * from that moment, before reception registers or anyone pays, so the sheet handed over at the
 * start already holds the whole course for the nurse to tick by hand. Registered sessions fill
 * the boxes in order (planned date, done date); the rest stay empty. A course line registered
 * without a referral (or from a cancelled one) is a course of its own sessions.
 */

export interface CourseSourceReferral {
  id: string;
  status: string;
  quantity: number;
  perDay: number | null;
  days: number | null;
  service: { name: string };
}

export interface CourseSourceItem<S> {
  referralId?: string | null;
  serviceName: string;
  status?: string;
  referral?: { perDay: number | null; days: number | null } | null;
  sessions?: S[];
}

export interface CaseCourse<S> {
  name: string;
  perDay: number | null;
  days: number | null;
  /** The referral this course comes from; null = registered without one. */
  referralId: string | null;
  /** One box per session, in order; null = not registered yet (no date). */
  sessions: Array<S | null>;
}

/** A doctor's course referral (perDay × days), as `cases:addReferral` stores it. */
export const isCourseReferral = (r: Pick<CourseSourceReferral, 'perDay' | 'days'>) =>
  r.perDay != null && r.days != null;

export function caseCourses<S extends { number: number }>(c: {
  referrals?: CourseSourceReferral[] | null;
  appointments?: Array<{ items: Array<CourseSourceItem<S>> }> | null;
}): Array<CaseCourse<S>> {
  const byNumber = (x: S, y: S) => x.number - y.number;
  const items = (c.appointments ?? [])
    .flatMap((a) => a.items)
    .filter((i) => i.status !== 'CANCELLED');

  const courses: Array<CaseCourse<S>> = [];
  const grouped = new Set<string>();
  for (const r of c.referrals ?? []) {
    if (r.status === 'CANCELLED' || !isCourseReferral(r)) continue;
    grouped.add(r.id);
    const done = items
      .filter((i) => i.referralId === r.id)
      .flatMap((i) => [...(i.sessions ?? [])].sort(byNumber));
    const sessions: Array<S | null> = [...done];
    while (sessions.length < r.quantity) sessions.push(null);
    courses.push({
      name: r.service.name,
      perDay: r.perDay,
      days: r.days,
      referralId: r.id,
      sessions,
    });
  }
  for (const i of items) {
    if (!i.sessions?.length || (i.referralId && grouped.has(i.referralId))) continue;
    courses.push({
      name: i.serviceName,
      perDay: i.referral?.perDay ?? null,
      days: i.referral?.days ?? null,
      referralId: null,
      sessions: [...i.sessions].sort(byNumber),
    });
  }
  return courses;
}
