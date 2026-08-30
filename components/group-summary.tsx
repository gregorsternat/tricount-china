"use client";

import { ArrowDownLeft, ArrowUpRight, UsersRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

import { AnimatedNumber } from "@/components/motion/animated-number";
import { ParticipantAvatar } from "@/components/participant-avatar";
import { calculateBalances, calculateTotalExpenses } from "@/lib/domain";
import { formatCny, formatEurFromFen } from "@/lib/format";
import { getActiveExpenses, type LedgerGroup } from "@/lib/ledger-store";
import { cn } from "@/lib/utils";

export function GroupSummary({
  group,
  rate,
  displayCurrency,
  onDisplayCurrencyChange,
}: {
  group: LedgerGroup;
  rate: number | null;
  displayCurrency: "CNY" | "EUR";
  onDisplayCurrencyChange: (currency: "CNY" | "EUR") => void;
}) {
  const reduce = useReducedMotion();
  const expenses = useMemo(() => getActiveExpenses(group), [group]);
  const totalFen = calculateTotalExpenses(expenses);
  const balances = calculateBalances(group.participants, expenses, group.settlements);
  const personalBalanceFen =
    balances.find((balance) => balance.participantId === group.currentParticipantId)
      ?.balanceFen ?? 0;
  const showEur = displayCurrency === "EUR" && rate !== null;
  const animatedTotal = showEur ? (totalFen / 100) * rate : totalFen / 100;
  const formatPrimary = (value: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: showEur ? "EUR" : "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative isolate overflow-hidden rounded-[30px] bg-[#1d2d27] px-5 py-5 text-white shadow-[0_24px_80px_rgba(29,45,39,0.2)] sm:px-7 sm:py-6"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full bg-[#d65c40]/80 blur-[1px]" />
      <div className="pointer-events-none absolute -bottom-24 right-24 size-44 rounded-full border-[28px] border-white/5" />
      <div className="pointer-events-none absolute left-[46%] top-0 h-full w-px rotate-[20deg] bg-white/5" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">
            <UsersRound className="size-3.5" />
            Dépensé par le groupe
          </div>
          <AnimatedNumber
            value={animatedTotal}
            duration={0.8}
            startOnView={false}
            format={formatPrimary}
            className="mt-3 block text-[clamp(2rem,8vw,3.25rem)] font-semibold leading-none tracking-[-0.065em]"
          />
          {rate ? (
            <p className="mt-2 text-xs tabular-nums text-white/55">
              {showEur ? formatCny(totalFen) : `≈ ${formatEurFromFen(totalFen, rate)}`}
            </p>
          ) : (
            <p className="mt-2 text-xs text-white/55">Conversion EUR en attente</p>
          )}
        </div>

        <div className="relative flex rounded-full border border-white/15 bg-black/10 p-1 backdrop-blur-sm">
          {(["CNY", "EUR"] as const).map((currency) => (
            <button
              key={currency}
              type="button"
              onClick={() => onDisplayCurrencyChange(currency)}
              disabled={currency === "EUR" && rate === null}
              className={cn(
                "relative min-h-9 min-w-12 rounded-full px-3 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                displayCurrency === currency ? "text-[#1d2d27]" : "text-white/65",
              )}
              aria-pressed={displayCurrency === currency}
              title={currency === "EUR" && rate === null ? "Taux EUR indisponible" : undefined}
            >
              {displayCurrency === currency ? (
                <motion.span
                  layoutId="summary-currency-pill"
                  className="absolute inset-0 rounded-full bg-[#f8f3e9]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <span className="relative">{currency}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid size-9 place-items-center rounded-full",
              personalBalanceFen > 0
                ? "bg-emerald-300/15 text-emerald-200"
                : personalBalanceFen < 0
                  ? "bg-[#f39b84]/15 text-[#ffc2b2]"
                  : "bg-white/10 text-white/65",
            )}
          >
            {personalBalanceFen >= 0 ? (
              <ArrowDownLeft className="size-4" />
            ) : (
              <ArrowUpRight className="size-4" />
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/50">
              {personalBalanceFen > 0
                ? "On te doit"
                : personalBalanceFen < 0
                  ? "Tu dois"
                  : "Ton solde"}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {showEur && rate
                ? formatEurFromFen(Math.abs(personalBalanceFen), rate)
                : formatCny(Math.abs(personalBalanceFen))}
            </p>
          </div>
        </div>

        <div className="flex items-center">
          <div className="flex -space-x-2">
            {group.participants.slice(0, 5).map((participant) => (
              <ParticipantAvatar
                key={participant.id}
                id={participant.id}
                name={participant.name}
                className="size-8 border-[#1d2d27]"
              />
            ))}
          </div>
          <span className="ml-3 text-[11px] font-medium text-white/55">
            {group.participants.length} personne{group.participants.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </motion.section>
  );
}
