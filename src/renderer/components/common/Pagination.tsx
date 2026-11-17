import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import {
  clampPage,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  pageCount,
  pageList,
  pageRange,
  pageSlice,
} from '../../../shared/pagination';

/**
 * The pagination bar under every table, in the till and on the web dashboard (the web imports it
 * through `@components/common`), after posgro's components/common/Pagination: "1–25 of 312", the
 * page buttons with gaps, previous / next, rows per page. Hidden when every row fits on the
 * smallest page, so a short table looks as before.
 *
 * Server-paged lists pass page / pageSize / total; tables that hold all their rows use
 * `usePagination` below.
 */
export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange(page: number): void;
  /** Omitted: no rows-per-page choice. */
  onPageSizeChange?(size: number): void;
  pageSizeOptions?: readonly number[];
  /** Show the bar even when everything fits on one page. */
  alwaysShow?: boolean;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZES,
  alwaysShow = false,
}: PaginationProps) {
  const { t } = useTranslation();
  const pages = pageCount(total, pageSize);
  const current = clampPage(page, pages);
  if (!alwaysShow && total <= Math.min(pageSize, ...pageSizeOptions)) return null;
  const { from, to } = pageRange(current, pageSize, total);

  return (
    <Bar>
      <Info>{t('pagination.showing', { from, to, total })}</Info>
      <Controls>
        <NavButton
          type="button"
          onClick={() => onPageChange(current - 1)}
          disabled={current <= 1}
          aria-label={t('pagination.prev')}
          title={t('pagination.prev')}
        >
          <ChevronLeft size={15} />
        </NavButton>
        {pageList(current, pages).map((p, i) =>
          p === 'gap' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: two gaps at most, fixed positions
            <Gap key={`gap-${i}`}>…</Gap>
          ) : (
            <NavButton
              key={p}
              type="button"
              $active={p === current}
              aria-current={p === current ? 'page' : undefined}
              onClick={() => p !== current && onPageChange(p)}
            >
              {p}
            </NavButton>
          ),
        )}
        <NavButton
          type="button"
          onClick={() => onPageChange(current + 1)}
          disabled={current >= pages}
          aria-label={t('pagination.next')}
          title={t('pagination.next')}
        >
          <ChevronRight size={15} />
        </NavButton>
        {onPageSizeChange && (
          <SizeLabel>
            {t('pagination.rowsPerPage')}
            <SizeSelect value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SizeSelect>
          </SizeLabel>
        )}
      </Controls>
    </Bar>
  );
}

/**
 * Client-side paging of rows a page already holds. `resetKey` (the search text, the filters): the
 * page goes back to 1 when it changes. A page past the end (rows removed) moves to the last one.
 */
export function usePagination<T>(
  rows: readonly T[],
  opts: { pageSize?: number; resetKey?: unknown } = {},
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(opts.pageSize ?? DEFAULT_PAGE_SIZE);
  const total = rows.length;
  const pages = pageCount(total, pageSize);
  const current = clampPage(page, pages);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the filters change
  useEffect(() => setPage(1), [opts.resetKey]);

  const pageRows = useMemo(() => pageSlice(rows, current, pageSize), [rows, current, pageSize]);
  const bind: PaginationProps = {
    page: current,
    pageSize,
    total,
    onPageChange: (p) => setPage(clampPage(p, pages)),
    onPageSizeChange: (size) => {
      // Keep the first row shown in sight.
      const first = (current - 1) * pageSize;
      setPageSize(size);
      setPage(Math.floor(first / size) + 1);
    },
  };
  return { pageRows, bind };
}

/**
 * A table that holds all its rows, paged: renders `children` with one page of `rows`, then the
 * bar. `offset` is the page's first row number (0-based), for tables that number their rows.
 *
 *   <Paged rows={patients} resetKey={search}>
 *     {(pageRows) => <Table>…{pageRows.map(…)}…</Table>}
 *   </Paged>
 */
export function Paged<T>({
  rows,
  pageSize,
  resetKey,
  children,
}: {
  rows: readonly T[];
  pageSize?: number;
  resetKey?: unknown;
  children: (pageRows: T[], offset: number) => ReactNode;
}) {
  const { pageRows, bind } = usePagination(rows, { pageSize, resetKey });
  return (
    <>
      {children(pageRows, (bind.page - 1) * bind.pageSize)}
      <Pagination {...bind} />
    </>
  );
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
`;
const Info = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;
const Controls = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
`;
const NavButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.background)};
  color: ${({ theme, $active }) => ($active ? '#fff' : theme.colors.text)};
  font: inherit;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  cursor: ${({ $active }) => ($active ? 'default' : 'pointer')};
  transition:
    border-color 0.15s,
    color 0.15s;

  &:hover:not(:disabled):not([aria-current='page']) {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }
`;
const Gap = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 32px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  user-select: none;
`;
const SizeLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: ${({ theme }) => theme.spacing.sm};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;
const SizeSelect = styled.select`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
  font-size: 13px;
  cursor: pointer;
`;
