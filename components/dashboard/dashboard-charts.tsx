"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DashboardSnapshot } from "@/lib/dashboard/types";
import { formatCny, formatMonthKey } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/types";

interface DailySpendingChartProps {
  readonly daily: DashboardSnapshot["daily"];
  readonly spentFen: number;
  readonly locale: Locale;
  readonly copy: Messages["dashboard"]["charts"];
}

export function DailySpendingChart({
  daily,
  spentFen,
  locale,
  copy,
}: DailySpendingChartProps) {
  const data = daily
    .filter((day) => day.observed)
    .map((day) => ({ day: day.day, spend: day.spentFen / 100 }));
  const config = {
    spend: { label: copy.spend, color: "#c9ff63" },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className="mt-3 h-[150px] w-full min-w-0 aspect-auto sm:h-[176px]"
      aria-label={`${copy.daily}: ${formatCny(spentFen, false, locale)}`}
    >
      <AreaChart accessibilityLayer data={data} margin={{ left: 0, right: 0, top: 14, bottom: 0 }}>
        <defs>
          <linearGradient id="daily-spend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-spend)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--color-spend)" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          minTickGap={28}
          tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 10 }}
        />
        <YAxis hide domain={[0, "dataMax + 10"]} />
        <ChartTooltip
          cursor={{ stroke: "rgba(255,255,255,0.16)" }}
          content={(
            <ChartTooltipContent
              hideLabel
              formatter={(value) => (
                <span className="font-semibold">{formatCny(Number(value) * 100, false, locale)}</span>
              )}
            />
          )}
        />
        <Area
          dataKey="spend"
          type="monotone"
          fill="url(#daily-spend-fill)"
          stroke="var(--color-spend)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: "#c9ff63", stroke: "#173f35", strokeWidth: 2 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

interface SixMonthTrendChartProps {
  readonly trend: DashboardSnapshot["trend"];
  readonly locale: Locale;
  readonly copy: Messages["dashboard"]["charts"];
}

export function SixMonthTrendChart({ trend, locale, copy }: SixMonthTrendChartProps) {
  const data = trend.map((month) => ({
    month: formatMonthKey(month.key, locale, "short"),
    spend: month.spentFen / 100,
  }));
  const config = { spend: { label: copy.spend, color: "#173f35" } } satisfies ChartConfig;

  return (
    <article className="min-w-0 rounded-[26px] border border-[#173f35]/8 bg-[#fffdf8] p-5 shadow-[0_12px_36px_rgba(23,63,53,0.05)] sm:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.035em]">{copy.trend}</h2>
        <p className="mt-1 text-xs leading-5 text-[#738078]">{copy.trendDescription}</p>
      </div>
      <ChartContainer
        config={config}
        className="mt-5 h-[220px] w-full min-w-0 aspect-auto"
        aria-label={`${copy.trend}: ${data.map((item) => `${item.month} ${item.spend}`).join(", ")}`}
      >
        <BarChart accessibilityLayer data={data} margin={{ left: -20, right: 0, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} />
          <YAxis hide />
          <ChartTooltip
            cursor={{ fill: "rgba(23,63,53,0.05)" }}
            content={(
              <ChartTooltipContent
                indicator="line"
                formatter={(value) => (
                  <span className="font-semibold">{formatCny(Number(value) * 100, false, locale)}</span>
                )}
              />
            )}
          />
          <Bar dataKey="spend" fill="var(--color-spend)" radius={[8, 8, 3, 3]} maxBarSize={48} />
        </BarChart>
      </ChartContainer>
    </article>
  );
}
