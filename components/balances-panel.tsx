"use client";

import { ArrowRight, Check, Copy, RotateCcw, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { CurrencyAmount } from "@/components/currency-amount";
import { ParticipantAvatar } from "@/components/participant-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  calculateBalances,
  simplifyDebts,
  type SimplifiedDebt,
} from "@/lib/domain";
import { formatCny, formatShortDate } from "@/lib/format";
import type { LedgerGroup } from "@/lib/ledger-store";
import { cn } from "@/lib/utils";

export function BalancesPanel({
  group,
  rate,
  displayCurrency,
  onSettle,
  onDeleteSettlement,
  onNotify,
}: {
  group: LedgerGroup;
  rate: number | null;
  displayCurrency: "CNY" | "EUR";
  onSettle: (debt: SimplifiedDebt) => void;
  onDeleteSettlement: (settlementId: string) => void;
  onNotify: (title: string, description?: string) => void;
}) {
  const reduce = useReducedMotion();
  const [pendingDebt, setPendingDebt] = useState<SimplifiedDebt | null>(null);
  const activeExpenses = group.expenses.filter((expense) => !expense.deletedAt);
  const balances = useMemo(
    () => calculateBalances(group.participants, activeExpenses, group.settlements),
    [activeExpenses, group.participants, group.settlements],
  );
  const debts = useMemo(() => simplifyDebts(balances), [balances]);
  const participantById = new Map(
    group.participants.map((participant) => [participant.id, participant]),
  );

  const copyDebt = async (debt: SimplifiedDebt) => {
    const from = participantById.get(debt.fromParticipantId)?.name ?? "Quelqu’un";
    const to = participantById.get(debt.toParticipantId)?.name ?? "quelqu’un";
    const text = `${from} doit envoyer ${formatCny(debt.amountFen)} à ${to} pour « ${group.name} ».`;
    try {
      await navigator.clipboard.writeText(text);
      onNotify("Message copié", "Prêt à coller dans WeChat.");
    } catch {
      onNotify("Copie impossible", text);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Position de chacun
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Soldes</h2>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1 font-medium">
            {group.participants.length} membres
          </Badge>
        </div>

        <div className="space-y-2">
          {balances.map((balance, index) => {
            const participant = participantById.get(balance.participantId);
            if (!participant) return null;
            return (
              <motion.div
                key={balance.participantId}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : index * 0.035 }}
                className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/65 p-3 shadow-[0_8px_30px_rgba(56,45,32,0.04)]"
              >
                <ParticipantAvatar id={participant.id} name={participant.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {participant.name}
                    {participant.id === group.currentParticipantId ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (toi)
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {balance.balanceFen > 0
                      ? "doit recevoir"
                      : balance.balanceFen < 0
                        ? "doit rembourser"
                        : "tout est réglé"}
                  </p>
                </div>
                <CurrencyAmount
                  fen={Math.abs(balance.balanceFen)}
                  rate={rate}
                  displayCurrency={displayCurrency}
                  className={cn(
                    "text-sm font-bold",
                    balance.balanceFen > 0
                      ? "text-emerald-700"
                      : balance.balanceFen < 0
                        ? "text-[#b04936]"
                        : "text-muted-foreground",
                  )}
                  showSecondary={false}
                />
              </motion.div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-[#b54c36]" />
          <h2 className="text-sm font-semibold">Remboursements suggérés</h2>
        </div>

        {debts.length ? (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {debts.map((debt) => {
                const from = participantById.get(debt.fromParticipantId);
                const to = participantById.get(debt.toParticipantId);
                if (!from || !to) return null;
                return (
                  <motion.article
                    layout
                    key={`${debt.fromParticipantId}-${debt.toParticipantId}`}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="rounded-[22px] border border-[#e8d9d2] bg-[#fff9f6] p-4"
                  >
                    <div className="flex items-center gap-2">
                      <ParticipantAvatar id={from.id} name={from.name} className="size-8" />
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      <ParticipantAvatar id={to.id} name={to.name} className="size-8" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="truncate font-semibold">
                          {from.name} <span className="font-normal text-muted-foreground">verse à</span> {to.name}
                        </p>
                      </div>
                      <CurrencyAmount
                        fen={debt.amountFen}
                        rate={rate}
                        displayCurrency={displayCurrency}
                        className="text-sm font-bold"
                        showSecondary={false}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-[44px_1fr] gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-11 rounded-xl bg-white"
                        onClick={() => void copyDebt(debt)}
                        aria-label="Copier le message de remboursement"
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        className="h-11 rounded-xl bg-[#1d2d27] text-white hover:bg-[#263b33]"
                        onClick={() => setPendingDebt(debt)}
                      >
                        <Check className="size-4" />
                        Marquer comme remboursé
                      </Button>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-[#9eb7a7] bg-[#edf5ef] p-5 text-center">
            <div className="mx-auto grid size-10 place-items-center rounded-full bg-white text-emerald-700 shadow-sm">
              <Check className="size-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-[#315943]">Tout est équilibré</p>
            <p className="mt-1 text-xs text-[#547060]">Aucun remboursement à faire.</p>
          </div>
        )}
      </section>

      {group.settlements.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Remboursements enregistrés</h2>
          <div className="space-y-2">
            {[...group.settlements].reverse().map((settlement) => {
              const from = participantById.get(settlement.fromParticipantId);
              const to = participantById.get(settlement.toParticipantId);
              return (
                <div
                  key={settlement.id}
                  className="flex items-center gap-3 rounded-2xl border bg-white/55 px-3 py-2.5"
                >
                  <Check className="size-4 shrink-0 text-emerald-700" />
                  <p className="min-w-0 flex-1 text-xs leading-5">
                    <span className="font-semibold">{from?.name}</span> a versé {formatCny(settlement.amountFen)} à{" "}
                    <span className="font-semibold">{to?.name}</span>
                    {settlement.settledAt ? (
                      <span className="text-muted-foreground"> · {formatShortDate(settlement.settledAt)}</span>
                    ) : null}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-full"
                    onClick={() => onDeleteSettlement(settlement.id)}
                    aria-label="Annuler ce remboursement"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <AlertDialog open={Boolean(pendingDebt)} onOpenChange={(open) => !open && setPendingDebt(null)}>
        <AlertDialogContent className="rounded-[26px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Le paiement a bien été fait ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action enregistre le remboursement et recalcule immédiatement tous les soldes. Fēn n’envoie pas d’argent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Pas encore</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-[#1d2d27] hover:bg-[#263b33]"
              onClick={() => {
                if (pendingDebt) onSettle(pendingDebt);
                setPendingDebt(null);
              }}
            >
              Oui, enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
