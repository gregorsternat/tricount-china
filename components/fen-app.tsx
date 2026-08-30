"use client";

import {
  ChevronDown,
  CircleDollarSign,
  Plus,
  ReceiptText,
  Settings2,
  UsersRound,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { BalancesPanel } from "@/components/balances-panel";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { ExchangeRateCard } from "@/components/exchange-rate-card";
import { ExpenseDialog } from "@/components/expense-dialog";
import { ExpensesList } from "@/components/expenses-list";
import { FenLogo } from "@/components/fen-logo";
import { GroupSummary } from "@/components/group-summary";
import { MembersPanel } from "@/components/members-panel";
import {
  AnimatedToastStack,
  useAnimatedToastStack,
} from "@/components/motion/animated-toast-stack";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import type { SimplifiedDebt } from "@/lib/domain";
import { calculateTotalExpenses } from "@/lib/domain";
import { formatCny, todayInShanghai } from "@/lib/format";
import {
  getActiveExpenses,
  useLedgerStore,
  type ExpenseDraft,
  type LedgerExpense,
} from "@/lib/ledger-store";
import { cn } from "@/lib/utils";

type MobileView = "expenses" | "balances" | "members";
type SideView = "balances" | "members";

export function FenApp() {
  const reduce = useReducedMotion();
  const ledger = useLedgerStore();
  const exchange = useExchangeRate();
  const [displayCurrency, setDisplayCurrency] = useState<"CNY" | "EUR">("CNY");
  const [mobileView, setMobileView] = useState<MobileView>("expenses");
  const [sideView, setSideView] = useState<SideView>("balances");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<LedgerExpense | undefined>();
  const toast = useAnimatedToastStack({ limit: 4 });

  const notify = (title: string, description?: string) => {
    toast.showToast({ title, description, status: "success" });
  };

  if (!ledger.isHydrated) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center"
        >
          <FenLogo />
          <div className="mt-6 h-1 w-24 overflow-hidden rounded-full bg-[#dfd9cf]">
            <motion.div
              className="h-full w-1/2 rounded-full bg-[#d35b40]"
              animate={reduce ? undefined : { x: ["-100%", "200%"] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Ouverture de tes comptes…</p>
        </motion.div>
      </main>
    );
  }

  const group = ledger.selectedGroup;

  if (!group) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto w-fit"><FenLogo /></div>
          <h1 className="mt-8 text-3xl font-semibold tracking-[-0.05em]">Crée ton premier groupe</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Ajoute tes amis, saisis les dépenses en RMB et Fēn fera les comptes.
          </p>
          <Button
            className="mt-6 h-12 rounded-2xl bg-[#1d2d27] text-white hover:bg-[#263b33]"
            onClick={() => setCreateGroupOpen(true)}
          >
            <Plus className="size-4" />
            Créer un groupe
          </Button>
          {createGroupOpen ? (
            <CreateGroupDialog
              onCreate={(name, names) => ledger.createGroup(name, names)}
              onOpenChange={setCreateGroupOpen}
            />
          ) : null}
        </div>
      </main>
    );
  }

  const openNewExpense = () => {
    setEditingExpense(undefined);
    setExpenseDialogOpen(true);
  };

  const openEditExpense = (expense: LedgerExpense) => {
    setEditingExpense(expense);
    setExpenseDialogOpen(true);
  };

  const saveExpense = (draft: ExpenseDraft) => {
    try {
      if (editingExpense) {
        ledger.updateExpense(group.id, editingExpense.id, draft);
        notify("Dépense mise à jour", "Les soldes ont été recalculés.");
      } else {
        ledger.addExpense(group.id, draft);
        notify("Dépense ajoutée", "Les comptes du groupe sont à jour.");
      }
    } catch (error) {
      toast.showToast({
        title: "Impossible d’enregistrer",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        status: "error",
      });
    }
  };

  const deleteExpense = (expense: LedgerExpense) => {
    ledger.deleteExpense(group.id, expense.id);
    toast.showToast({
      title: "Dépense supprimée",
      description: expense.title,
      status: "neutral",
      duration: 7_000,
      action: {
        label: "Annuler",
        onClick: (currentToast) => {
          ledger.restoreExpense(group.id, expense.id);
          toast.dismissToast(currentToast.id);
          notify("Dépense restaurée");
        },
      },
    });
  };

  const settleDebt = (debt: SimplifiedDebt) => {
    ledger.addSettlement(group.id, {
      ...debt,
      settledAt: todayInShanghai(),
    });
    notify("Remboursement enregistré", "Les soldes viennent d’être recalculés.");
  };

  const createGroup = (name: string, participantNames: string[]) => {
    try {
      ledger.createGroup(name, participantNames);
      setMobileView("expenses");
      notify("Groupe créé", "Tu peux ajouter la première dépense.");
    } catch (error) {
      toast.showToast({
        title: "Impossible de créer le groupe",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        status: "error",
      });
    }
  };

  const panelProps = {
    group,
    rate: exchange.rate,
    displayCurrency,
    onSettle: settleDebt,
    onDeleteSettlement: (settlementId: string) => {
      ledger.deleteSettlement(group.id, settlementId);
      notify("Remboursement annulé", "Les soldes ont été restaurés.");
    },
    onNotify: notify,
  };

  const membersProps = {
    group,
    canDeleteGroup: ledger.groups.length > 1,
    onAddParticipant: (name: string) => ledger.addParticipant(group.id, name),
    onRenameGroup: (name: string) => ledger.renameGroup(group.id, name),
    onDeleteGroup: () => {
      ledger.deleteGroup(group.id);
      notify("Groupe supprimé");
    },
    onNotify: notify,
  };

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[286px] flex-col border-r border-white/70 bg-[#f1ede5]/80 px-4 py-5 backdrop-blur-2xl xl:flex">
        <div className="px-2"><FenLogo /></div>

        <div className="mt-9 flex items-center justify-between px-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted-foreground">
            Mes groupes
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCreateGroupOpen(true)}
            className="size-8 rounded-full"
            aria-label="Créer un groupe"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <nav className="mt-2 space-y-1.5" aria-label="Groupes">
          {ledger.groups.map((item) => {
            const active = item.id === group.id;
            const total = calculateTotalExpenses(getActiveExpenses(item));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => ledger.selectGroup(item.id)}
                className={cn(
                  "relative flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors",
                  active ? "text-[#1d2d27]" : "text-muted-foreground hover:bg-white/45 hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="active-desktop-group"
                    className="absolute inset-0 rounded-[18px] border border-white/80 bg-white/75 shadow-[0_10px_34px_rgba(54,44,31,0.07)]"
                  />
                ) : null}
                <span className="relative grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#eee8de] text-lg">
                  {item.emoji}
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                    {formatCny(total, true)} · {item.participants.length} pers.
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <Button
          type="button"
          variant="outline"
          onClick={() => setCreateGroupOpen(true)}
          className="mt-3 h-11 justify-start rounded-[16px] border-dashed bg-transparent text-muted-foreground hover:bg-white/50"
        >
          <Plus className="size-4" />
          Nouveau groupe
        </Button>

        <div className="mt-auto">
          <ExchangeRateCard exchange={exchange} />
          <p className="mt-3 px-2 text-[10px] leading-4 text-muted-foreground">
            Données locales · Aucun compte requis
          </p>
        </div>
      </aside>

      <div className="xl:pl-[286px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-white/60 bg-[#f6f3ed]/80 px-4 backdrop-blur-2xl sm:px-6 xl:h-[82px] xl:px-8">
          <div className="xl:hidden"><FenLogo compact /></div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white/45 xl:px-0 xl:hover:bg-transparent"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-lg shadow-sm xl:size-10">
                  {group.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold tracking-[-0.02em] sm:text-base">
                    {group.name}
                  </span>
                  <span className="hidden text-[11px] text-muted-foreground sm:block">
                    {group.participants.length} personnes · comptes en RMB
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 rounded-2xl p-2">
              <DropdownMenuLabel>Changer de groupe</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ledger.groups.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => ledger.selectGroup(item.id)}
                  className="min-h-12 rounded-xl"
                >
                  <span className="mr-2 text-lg">{item.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.id === group.id ? <span className="text-xs text-emerald-700">Actif</span> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreateGroupOpen(true)} className="rounded-xl">
                <Plus className="size-4" />
                Créer un groupe
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="hidden xl:block">
            <ExchangeRateCard exchange={exchange} compact />
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-10 rounded-full xl:hidden"
            onClick={() => setMobileView("members")}
            aria-label="Ouvrir les réglages du groupe"
          >
            <Settings2 className="size-4" />
          </Button>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-4 sm:px-6 sm:pt-6 xl:px-8 xl:pb-10">
          <div className="mb-3 flex justify-end xl:hidden">
            <ExchangeRateCard exchange={exchange} compact />
          </div>

          <GroupSummary
            group={group}
            rate={exchange.rate}
            displayCurrency={displayCurrency}
            onDisplayCurrencyChange={setDisplayCurrency}
          />

          <div className="mt-7 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-8 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className={cn(mobileView !== "expenses" && "hidden xl:block")}>
              <ExpensesList
                group={group}
                rate={exchange.rate}
                displayCurrency={displayCurrency}
                onAdd={openNewExpense}
                onEdit={openEditExpense}
                onDelete={deleteExpense}
              />
            </div>

            <div className={cn("xl:hidden", mobileView !== "balances" && "hidden")}>
              <BalancesPanel {...panelProps} />
            </div>

            <div className={cn("xl:hidden", mobileView !== "members" && "hidden")}>
              <MembersPanel key={group.id} {...membersProps} />
            </div>

            <aside className="hidden xl:block">
              <div className="mb-5 grid grid-cols-2 rounded-2xl bg-[#ebe6dd] p-1">
                {([
                  ["balances", "Soldes"],
                  ["members", "Membres"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSideView(value)}
                    className={cn(
                      "relative min-h-10 rounded-xl px-3 text-sm font-semibold transition-colors",
                      sideView === value ? "text-foreground" : "text-muted-foreground",
                    )}
                    aria-pressed={sideView === value}
                  >
                    {sideView === value ? (
                      <motion.span
                        layoutId="desktop-side-view"
                        className="absolute inset-0 rounded-xl bg-white shadow-sm"
                      />
                    ) : null}
                    <span className="relative">{label}</span>
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${group.id}-${sideView}`}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  {sideView === "balances" ? (
                    <BalancesPanel {...panelProps} />
                  ) : (
                    <MembersPanel key={group.id} {...membersProps} />
                  )}
                </motion.div>
              </AnimatePresence>
            </aside>
          </div>
        </main>
      </div>

      <nav
        className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-[1fr_1fr_1fr_52px] gap-1 rounded-[22px] border border-white/80 bg-[#fbfaf7]/92 p-1.5 shadow-[0_16px_60px_rgba(38,31,23,0.2)] backdrop-blur-2xl xl:hidden"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
        aria-label="Navigation du groupe"
      >
        {([
          ["expenses", "Dépenses", ReceiptText],
          ["balances", "Soldes", CircleDollarSign],
          ["members", "Membres", UsersRound],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMobileView(value)}
            className={cn(
              "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[10px] font-semibold transition-colors",
              mobileView === value ? "text-[#1d2d27]" : "text-muted-foreground",
            )}
            aria-current={mobileView === value ? "page" : undefined}
          >
            {mobileView === value ? (
              <motion.span
                layoutId="mobile-nav-active"
                className="absolute inset-0 rounded-[16px] bg-[#ece8df]"
              />
            ) : null}
            <Icon className="relative size-4" />
            <span className="relative">{label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={openNewExpense}
          className="grid size-12 place-items-center self-center rounded-[16px] bg-[#d3593e] text-white shadow-[0_8px_22px_rgba(211,89,62,0.32)] transition-transform active:scale-95"
          aria-label="Ajouter une dépense"
        >
          <Plus className="size-5" />
        </button>
      </nav>

      {expenseDialogOpen ? (
        <ExpenseDialog
          key={`${group.id}-${editingExpense?.id ?? "new"}`}
          group={group}
          expense={editingExpense}
          onSave={saveExpense}
          onOpenChange={setExpenseDialogOpen}
        />
      ) : null}

      {createGroupOpen ? (
        <CreateGroupDialog onCreate={createGroup} onOpenChange={setCreateGroupOpen} />
      ) : null}

      <AnimatedToastStack
        toasts={toast.toasts}
        onDismiss={toast.dismissToast}
        position="bottom-right"
        placement="fixed"
        portal
        classNames={{ root: "bottom-24 xl:bottom-6" }}
      />
    </div>
  );
}
