"use client";

import {
  BedDouble,
  Bike,
  Coffee,
  Ellipsis,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatCny, formatShortDate } from "@/lib/format";
import type { LedgerExpense, LedgerGroup } from "@/lib/ledger-store";
import { cn } from "@/lib/utils";

const CATEGORY_META = {
  food: { label: "Repas", icon: Utensils, color: "bg-[#f7ded5] text-[#8b3e2f]" },
  transport: { label: "Transport", icon: Bike, color: "bg-[#dceae1] text-[#2e6047]" },
  coffee: { label: "Café", icon: Coffee, color: "bg-[#efe2cf] text-[#6f4d2a]" },
  visit: { label: "Sortie", icon: Landmark, color: "bg-[#dfe5f4] text-[#3e5480]" },
  shopping: { label: "Courses", icon: ShoppingBag, color: "bg-[#e9ddf2] text-[#66427e]" },
  stay: { label: "Logement", icon: BedDouble, color: "bg-[#dcebed] text-[#315d62]" },
  other: { label: "Autre", icon: ReceiptText, color: "bg-[#ece9e2] text-[#625b50]" },
} as const;

export function ExpensesList({
  group,
  rate,
  displayCurrency,
  onAdd,
  onEdit,
  onDelete,
}: {
  group: LedgerGroup;
  rate: number | null;
  displayCurrency: "CNY" | "EUR";
  onAdd: () => void;
  onEdit: (expense: LedgerExpense) => void;
  onDelete: (expense: LedgerExpense) => void;
}) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<LedgerExpense | null>(null);
  const participantById = useMemo(
    () =>
      new Map(
        group.participants.map((participant) => [participant.id, participant]),
      ),
    [group.participants],
  );
  const expenses = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return group.expenses
      .filter((expense) => !expense.deletedAt)
      .filter((expense) => {
        if (!normalizedQuery) return true;
        const payer = participantById.get(expense.payerId)?.name ?? "";
        return `${expense.title} ${payer} ${expense.note ?? ""}`
          .toLocaleLowerCase("fr")
          .includes(normalizedQuery);
      })
      .sort((left, right) => {
        const byDate = right.occurredAt.localeCompare(left.occurredAt);
        return byDate || right.createdAt.localeCompare(left.createdAt);
      });
  }, [group.expenses, participantById, query]);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Registre
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em]">Dépenses</h2>
        </div>
        <Button
          type="button"
          onClick={onAdd}
          className="hidden h-11 rounded-xl bg-[#1d2d27] px-4 text-white hover:bg-[#263b33] sm:inline-flex"
        >
          <Plus className="size-4" />
          Ajouter
        </Button>
      </div>

      {group.expenses.filter((expense) => !expense.deletedAt).length > 4 ? (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une dépense…"
            className="h-11 rounded-xl border-white/80 bg-white/65 pl-10 shadow-sm"
            aria-label="Rechercher une dépense"
          />
        </div>
      ) : null}

      {expenses.length ? (
        <motion.div layout className="space-y-2.5">
          <AnimatePresence initial={false} mode="popLayout">
            {expenses.map((expense, index) => {
              const payer = participantById.get(expense.payerId);
              const category = CATEGORY_META[expense.category] ?? CATEGORY_META.other;
              const Icon = category.icon;
              const beneficiaryNames = expense.shares
                .map((share) => participantById.get(share.participantId)?.name)
                .filter(Boolean);

              return (
                <motion.article
                  layout
                  key={expense.id}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16, scale: 0.98 }}
                  transition={{ delay: reduce ? 0 : Math.min(index * 0.025, 0.15) }}
                  className="group relative overflow-hidden rounded-[22px] border border-white/80 bg-white/70 shadow-[0_8px_32px_rgba(62,49,33,0.045)] backdrop-blur-sm transition-colors hover:bg-white/90"
                >
                  <button
                    type="button"
                    onClick={() => onEdit(expense)}
                    className="flex min-h-[88px] w-full items-center gap-3 p-3 pr-14 text-left sm:p-4 sm:pr-16"
                    aria-label={`Modifier ${expense.title}, ${formatCny(expense.amountFen)}`}
                  >
                    <div
                      className={cn(
                        "grid size-11 shrink-0 place-items-center rounded-2xl",
                        category.color,
                      )}
                    >
                      <Icon className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold tracking-[-0.015em] sm:text-[15px]">
                          {expense.title}
                        </p>
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/75">
                          {formatShortDate(expense.occurredAt)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        {payer ? (
                          <ParticipantAvatar id={payer.id} name={payer.name} className="size-5 border" />
                        ) : null}
                        <span className="truncate">
                          Payé par {payer?.name ?? "?"} · {beneficiaryNames.length === group.participants.length ? "tout le groupe" : beneficiaryNames.join(", ")}
                        </span>
                      </div>
                    </div>
                    <CurrencyAmount
                      fen={expense.amountFen}
                      rate={rate}
                      displayCurrency={displayCurrency}
                      className="text-sm font-bold sm:text-[15px]"
                    />
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 size-10 -translate-y-1/2 rounded-full opacity-70 hover:bg-[#efeae2] group-hover:opacity-100"
                        aria-label={`Actions pour ${expense.title}`}
                      >
                        <Ellipsis className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 rounded-xl">
                      <DropdownMenuItem onSelect={() => onEdit(expense)}>
                        <Pencil className="size-4" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setPendingDelete(expense)}
                      >
                        <Trash2 className="size-4" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="rounded-[26px] border border-dashed border-[#cfc6b8] bg-white/45 px-5 py-12 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-[#9a503d] shadow-sm">
            <ReceiptText className="size-5" />
          </div>
          <p className="mt-4 text-sm font-semibold">
            {query ? "Aucun résultat" : "Aucune dépense pour le moment"}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
            {query
              ? "Essaie un autre mot ou efface la recherche."
              : "Ajoute le premier repas, taxi ou billet et Fēn calculera les soldes."}
          </p>
          {!query ? (
            <Button
              type="button"
              onClick={onAdd}
              className="mt-5 h-11 rounded-xl bg-[#1d2d27] text-white hover:bg-[#263b33]"
            >
              <Plus className="size-4" />
              Ajouter une dépense
            </Button>
          ) : null}
        </div>
      )}

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-[26px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette dépense ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {pendingDelete?.title} » sera retirée des comptes. Tu pourras l’annuler juste après.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Conserver</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
