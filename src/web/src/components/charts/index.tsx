import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '@theme/ThemeProvider';
import { formatMoney, formatNumber } from '../../lib/format';

function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function useChartColors() {
  const { theme } = useTheme();
  return {
    primary: theme.colors.primary,
    secondary: theme.colors.success,
    grid: theme.colors.border,
    text: theme.colors.textSecondary,
    surface: theme.colors.surface,
    textMain: theme.colors.text,
  };
}

/** Horizontal bars for a ranked list (top services / doctors). */
export function RankBarChart({
  rows,
}: {
  rows: { name: string; revenue: number; count: number }[];
}) {
  const { t } = useTranslation();
  const c = useChartColors();
  const height = Math.max(160, rows.length * 36 + 30);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke={c.grid} />
        <XAxis type="number" tickFormatter={compact} stroke={c.text} fontSize={12} />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          stroke={c.text}
          fontSize={12}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: `${c.primary}12` }}
          contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, color: c.textMain }}
          formatter={(value: number, _n, item) => [
            `${formatMoney(value)} · ${formatNumber((item?.payload as { count?: number })?.count ?? 0)} ${t('common.visitsShort')}`,
            t('reports.revenue'),
          ]}
        />
        <Bar dataKey="revenue" fill={c.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Revenue (line) and visits per day for the monthly report. */
export function DailyTrendChart({
  rows,
}: {
  rows: { label: string; revenue: number; visits: number }[];
}) {
  const { t } = useTranslation();
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" stroke={c.text} fontSize={12} />
        <YAxis yAxisId="m" tickFormatter={compact} stroke={c.text} fontSize={12} width={48} />
        <YAxis
          yAxisId="v"
          orientation="right"
          allowDecimals={false}
          stroke={c.text}
          fontSize={12}
          width={32}
        />
        <Tooltip
          contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, color: c.textMain }}
          formatter={(value: number, name: string) =>
            name === 'revenue'
              ? [formatMoney(value), t('reports.revenue')]
              : [formatNumber(value), t('reports.visits')]
          }
        />
        <Line
          yAxisId="m"
          type="monotone"
          dataKey="revenue"
          stroke={c.primary}
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="v"
          type="monotone"
          dataKey="visits"
          stroke={c.secondary}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
