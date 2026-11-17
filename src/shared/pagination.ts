/**
 * Pagination arithmetic for every table, in the till and on the web dashboard (the component is
 * src/renderer/components/common/Pagination.tsx, after posgro's). Pure, so tests pin it.
 */

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type PageItem = number | 'gap';

/** Pages for `total` rows of `pageSize` (at least 1). */
export function pageCount(total: number, pageSize: number): number {
  if (!(pageSize > 0)) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** `page` kept inside 1..pages (a filter that leaves fewer rows moves back to the last page). */
export function clampPage(page: number, pages: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.floor(page)), Math.max(1, pages));
}

/**
 * The page buttons: all of them up to 7 pages, else the first, the last and the current with its
 * neighbours, gaps between (posgro's buildPageList): always 7 slots, so the bar never jumps.
 */
export function pageList(current: number, pages: number): PageItem[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'gap', pages];
  if (current >= pages - 3) return [1, 'gap', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, 'gap', current - 1, current, current + 1, 'gap', pages];
}

/** The rows of one page (client-side tables). */
export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/** "From–to of total" for the bar; 0–0 of 0 when empty. */
export function pageRange(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  return { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total) };
}
