"use client";

import { SiAlipay, SiWechat } from "@icons-pack/react-simple-icons";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CloudOff,
  Coffee,
  HeartPulse,
  House,
  Languages,
  LogOut,
  Menu,
  PencilLine,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Store,
  TrainFront,
  UserPlus,
  Users,
  Utensils,
  WalletCards,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AddExpensePayload,
  CreateGroupPayload,
} from "@/components/dashboard/dashboard-dialogs";
import { LanguageSwitcher, useI18n } from "@/components/i18n";
import { AnimatedToastStack, useAnimatedToastStack } from "@/components/motion/animated-toast-stack";
import { BottomSheet } from "@/components/motion/bottom-sheet";
import { Button as MotionButton } from "@/components/motion/button/base";
import { Input as MotionInput } from "@/components/motion/input";
import { NumberTicker } from "@/components/motion/number-ticker";
import { PullToRefresh } from "@/components/motion/pull-to-refresh";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth-client";
import { createDemoDashboard } from "@/lib/dashboard/demo";
import { currentMonthKey, shiftMonth } from "@/lib/dashboard/period";
import { RefreshEpoch } from "@/lib/dashboard/refresh-epoch";
import type {
  DashboardGroup,
  DashboardScope,
  DashboardSnapshot,
  DashboardTransaction,
  MemberBalance,
  TransactionCategory,
  TransactionSource,
} from "@/lib/dashboard/types";
import {
  formatCny,
  formatDateTime,
  formatMonthKey,
  formatPercent,
  formatShortDate,
  initials,
} from "@/lib/format";
import { getIntlLocale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const DailySpendingChart = dynamic(() =>
  import("@/components/dashboard/dashboard-charts").then((module) => module.DailySpendingChart),
);
const SixMonthTrendChart = dynamic(() =>
  import("@/components/dashboard/dashboard-charts").then((module) => module.SixMonthTrendChart),
);
const AddExpenseDialog = dynamic(() =>
  import("@/components/dashboard/dashboard-dialogs").then((module) => module.AddExpenseDialog),
);
const AddMemberDialog = dynamic(() =>
  import("@/components/dashboard/dashboard-dialogs").then((module) => module.AddMemberDialog),
);
const BudgetDialog = dynamic(() =>
  import("@/components/dashboard/dashboard-dialogs").then((module) => module.BudgetDialog),
);
const CreateGroupDialog = dynamic(() =>
  import("@/components/dashboard/dashboard-dialogs").then((module) => module.CreateGroupDialog),
);
const ImportWalletDialog = dynamic(() =>
  import("@/components/dashboard/dashboard-dialogs").then((module) => module.ImportWalletDialog),
);
const ShareTransactionDialog = dynamic(() =>
  import("@/components/dashboard/dashboard-dialogs").then((module) => module.ShareTransactionDialog),
);
const SettlementDialog = dynamic(() =>
  import("@/components/dashboard/dashboard-dialogs").then((module) => module.SettlementDialog),
);

interface YearDashboardProps {
  readonly initialData: DashboardSnapshot;
  readonly demoMode?: boolean;
}

type DialogName =
  | "expense"
  | "group"
  | "import"
  | "member"
  | "budget"
  | "settlement"
  | "share"
  | null;

type MobileSheet = "menu" | "actions" | null;

const categoryIcons: Record<TransactionCategory, typeof Utensils> = {
  restaurant: Utensils,
  groceries: ShoppingBasket,
  food: Store,
  transport: TrainFront,
  housing: House,
  shopping: ShoppingBag,
  leisure: Coffee,
  travel: Plane,
  health: HeartPulse,
  other: Sparkles,
};

const categoryColors: Record<TransactionCategory, string> = {
  restaurant: "#173f35",
  groceries: "#7fae4f",
  food: "#b89c63",
  transport: "#65aaa3",
  housing: "#d99460",
  shopping: "#9d8cbc",
  leisure: "#d0a34e",
  travel: "#5d88b4",
  health: "#c77d78",
  other: "#b8b5aa",
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string | { message?: string } })
    | null;
  if (!response.ok) {
    const serverError = payload?.error;
    const message = typeof serverError === "string" ? serverError : serverError?.message;
    throw new Error(message ?? fallback);
  }
  if (!payload) throw new Error(fallback);
  return payload;
}

export function YearDashboard({ initialData, demoMode = false }: YearDashboardProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { locale, messages } = useI18n();
  const copy = messages.dashboard;
  const [snapshot, setSnapshot] = useState(initialData);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [importSource, setImportSource] = useState<Exclude<TransactionSource, "manual">>("wechat");
  const [selectedBalance, setSelectedBalance] = useState<MemberBalance | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<DashboardTransaction | null>(null);
  const [transactionFilter, setTransactionFilter] = useState<TransactionCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [syncState, setSyncState] = useState<"synced" | "syncing" | "offline">("synced");
  const refreshEpochRef = useRef(new RefreshEpoch());
  const refreshControllerRef = useRef<AbortController | null>(null);
  const mutationKeysRef = useRef(new Map<string, string>());
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({ limit: 3 });

  const selectedGroup = snapshot.groups.find((group) => group.id === snapshot.selectedGroupId);
  const remainingFen = snapshot.budgetFen - snapshot.spentFen;
  const budgetRatio = snapshot.budgetFen > 0 ? snapshot.spentFen / snapshot.budgetFen : 0;
  const currentUserBalanceFen = snapshot.balances.find((member) => member.isCurrentUser)?.balanceFen ?? 0;
  const monthOptions = useMemo(() => {
    const current = currentMonthKey();
    const values = Array.from({ length: 18 }, (_, index) => shiftMonth(current, index - 17));
    if (!values.includes(snapshot.period.key)) values.unshift(snapshot.period.key);
    return [...new Set(values)].sort().reverse();
  }, [snapshot.period.key]);
  const monthTitle = useMemo(
    () => formatMonthTitle(snapshot.period.key, locale),
    [locale, snapshot.period.key],
  );

  const displayedTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(getIntlLocale(locale));
    const filtered = snapshot.transactions.filter((transaction) => {
      const matchesCategory = transactionFilter === "all" || transaction.category === transactionFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${transaction.title} ${transaction.merchant}`
          .toLocaleLowerCase(getIntlLocale(locale))
          .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
    return showAllTransactions ? filtered : filtered.slice(0, 6);
  }, [locale, query, showAllTransactions, snapshot.transactions, transactionFilter]);

  const updateLocation = useCallback((scope: DashboardScope, month: string, groupId?: string) => {
    const params = new URLSearchParams({ month, scope });
    if (scope === "group" && groupId) params.set("groupId", groupId);
    window.history.replaceState(window.history.state, "", `/?${params.toString()}`);
  }, []);

  const invalidatePendingRefresh = useCallback(() => {
    refreshEpochRef.current.invalidate();
    refreshControllerRef.current?.abort();
    refreshControllerRef.current = null;
  }, []);

  const idempotencyKeyFor = useCallback((identity: string) => {
    const existing = mutationKeysRef.current.get(identity);
    if (existing) return existing;
    const created = crypto.randomUUID();
    mutationKeysRef.current.set(identity, created);
    return created;
  }, []);

  const refreshSnapshot = useCallback(async (
    scope = snapshot.scope,
    groupId = snapshot.selectedGroupId,
    month = snapshot.period.key,
  ) => {
    if (demoMode) {
      const next = createDemoDashboard(scope, month, groupId);
      setSnapshot(next);
      setSyncState("synced");
      updateLocation(scope, month, next.selectedGroupId);
      return;
    }

    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    const requestEpoch = refreshEpochRef.current.begin();
    setSyncState("syncing");
    try {
      const params = new URLSearchParams({ scope, month });
      if (scope === "group" && groupId) params.set("groupId", groupId);
      const response = await fetch(`/api/dashboard?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const next = await readJson<DashboardSnapshot>(response, copy.notices.refreshFailed);
      if (!refreshEpochRef.current.isCurrent(requestEpoch)) return;
      setSnapshot(next);
      setSyncState("synced");
      updateLocation(scope, month, next.selectedGroupId);
    } catch (error) {
      if (controller.signal.aborted || !refreshEpochRef.current.isCurrent(requestEpoch)) return;
      setSyncState("offline");
      showToast({
        title: error instanceof Error ? error.message : copy.notices.refreshFailed,
        status: "error",
      });
    } finally {
      if (refreshControllerRef.current === controller) refreshControllerRef.current = null;
    }
  }, [copy.notices.refreshFailed, demoMode, showToast, snapshot.period.key, snapshot.scope, snapshot.selectedGroupId, updateLocation]);

  const mutation = useCallback(async <T extends { snapshot?: DashboardSnapshot }>(
    path: string,
    body: unknown,
    demoAction: () => void,
    successMessage: string,
  ): Promise<T | undefined> => {
    if (demoMode) {
      demoAction();
      showToast({ title: successMessage, status: "success" });
      return undefined;
    }

    invalidatePendingRefresh();
    setSyncState("syncing");
    const mutationIdentity = `${path}:${JSON.stringify(body)}`;
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKeyFor(mutationIdentity),
        },
        body: JSON.stringify(body),
      });
      const payload = await readJson<T>(response, copy.notices.serverError);
      invalidatePendingRefresh();
      mutationKeysRef.current.delete(mutationIdentity);
      if (payload.snapshot?.period.key === snapshot.period.key) {
        setSnapshot(payload.snapshot);
      } else {
        await refreshSnapshot();
      }
      setSyncState("synced");
      showToast({ title: successMessage, status: "success" });
      return payload;
    } catch (error) {
      setSyncState("offline");
      throw error;
    }
  }, [copy.notices.serverError, demoMode, idempotencyKeyFor, invalidatePendingRefresh, refreshSnapshot, showToast, snapshot.period.key]);

  const switchScope = useCallback((scope: DashboardScope) => {
    if (scope === snapshot.scope) return;
    if (scope === "group" && snapshot.groups.length === 0) {
      setDialog("group");
      showToast({ title: copy.notices.firstGroup, status: "info" });
      return;
    }
    setTransactionFilter("all");
    setShowAllTransactions(false);
    void refreshSnapshot(
      scope,
      scope === "group" ? selectedGroup?.id ?? snapshot.groups[0]?.id : undefined,
      snapshot.period.key,
    );
  }, [copy.notices.firstGroup, refreshSnapshot, selectedGroup?.id, showToast, snapshot.groups, snapshot.period.key, snapshot.scope]);

  useEffect(() => {
    if (demoMode) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshSnapshot();
    };
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("online", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [demoMode, refreshSnapshot]);

  useEffect(() => () => refreshControllerRef.current?.abort(), []);

  const selectGroup = (group: DashboardGroup) => {
    setMobileSheet(null);
    setTransactionFilter("all");
    setShowAllTransactions(false);
    void refreshSnapshot("group", group.id, snapshot.period.key);
  };

  const selectMonth = (month: string) => {
    if (month > currentMonthKey()) return;
    setShowAllTransactions(false);
    void refreshSnapshot(snapshot.scope, snapshot.selectedGroupId, month);
  };

  const addExpense = async (payload: AddExpensePayload) => {
    await mutation(
      "/api/expenses",
      { ...payload, month: snapshot.period.key },
      () => {
        const nextTransaction: DashboardTransaction = {
          id: `demo-${Date.now()}`,
          title: payload.title,
          merchant: payload.title,
          occurredAt: payload.occurredAt,
          amountFen: payload.amountFen,
          category: payload.category,
          source: "manual",
          paidBy: snapshot.viewer.name,
          groupId: payload.groupId,
          shared: Boolean(payload.groupId),
        };
        setSnapshot((current) => ({
          ...current,
          spentFen: current.spentFen + payload.amountFen,
          transactions: [nextTransaction, ...current.transactions],
          categories: current.categories.some((item) => item.category === payload.category)
            ? current.categories.map((item) => item.category === payload.category
              ? { ...item, amountFen: item.amountFen + payload.amountFen }
              : item)
            : [...current.categories, { category: payload.category, amountFen: payload.amountFen }],
          revision: current.revision + 1,
        }));
      },
      copy.notices.expenseAdded,
    );
  };

  const createGroup = async (payload: CreateGroupPayload) => {
    const result = await mutation<{
      snapshot?: DashboardSnapshot;
      invitationUrls?: string[];
    }>(
      "/api/groups",
      { ...payload, month: snapshot.period.key },
      () => {
        const group: DashboardGroup = {
          id: `demo-group-${Date.now()}`,
          name: payload.name,
          city: payload.city,
          memberCount: 1 + payload.inviteEmails.length,
          spentFen: 0,
          accent: "#c9ff63",
        };
        setSnapshot((current) => ({
          ...current,
          groups: [...current.groups, group],
          revision: current.revision + 1,
        }));
      },
      copy.notices.groupCreated,
    );
    const invitationUrls = result?.invitationUrls;
    if (invitationUrls?.length && navigator.clipboard) {
      await navigator.clipboard.writeText(invitationUrls.join("\n")).catch(() => undefined);
    }
  };

  const updateBudget = async (budgetFen: number) => {
    await mutation(
      "/api/budgets",
      {
        budgetFen,
        month: snapshot.period.key,
        scope: snapshot.scope,
        groupId: snapshot.selectedGroupId,
      },
      () => setSnapshot((current) => ({ ...current, budgetFen, revision: current.revision + 1 })),
      copy.notices.budgetUpdated,
    );
  };

  const inviteMember = async (email: string) => {
    if (!selectedGroup) throw new Error(copy.notices.groupUnavailable);
    const result = await mutation<{ snapshot?: DashboardSnapshot; invitationUrl?: string }>(
      `/api/groups/${selectedGroup.id}/invitations`,
      { email, month: snapshot.period.key },
      () => setSnapshot((current) => ({
        ...current,
        groups: current.groups.map((group) => group.id === selectedGroup.id
          ? { ...group, memberCount: group.memberCount + 1 }
          : group),
        revision: current.revision + 1,
      })),
      copy.notices.invitationCreated,
    );
    if (result?.invitationUrl && navigator.clipboard) {
      await navigator.clipboard.writeText(result.invitationUrl).catch(() => undefined);
    }
  };

  const shareTransaction = async (transaction: DashboardTransaction, groupId: string) => {
    if (!snapshot.groups.some((group) => group.id === groupId)) {
      throw new Error(copy.notices.groupUnavailable);
    }
    await mutation(
      `/api/wallet-transactions/${transaction.id}/share`,
      { groupId, month: snapshot.period.key },
      () => setSnapshot((current) => ({
        ...current,
        transactions: current.transactions.map((item) => item.id === transaction.id
          ? { ...item, groupId, shared: true }
          : item),
        revision: current.revision + 1,
      })),
      copy.notices.transactionShared,
    );
  };

  const settleBalance = async (memberId: string, amountFen: number) => {
    if (!selectedGroup) throw new Error(copy.notices.groupUnavailable);
    await mutation(
      `/api/groups/${selectedGroup.id}/settlements`,
      { memberId, amountFen, month: snapshot.period.key },
      () => setSnapshot((current) => ({
        ...current,
        balances: current.balances.map((balance) => balance.id === memberId
          ? { ...balance, balanceFen: Math.sign(balance.balanceFen) * Math.max(0, Math.abs(balance.balanceFen) - amountFen) }
          : balance),
        revision: current.revision + 1,
      })),
      copy.notices.settlementRecorded,
    );
  };

  const signOut = async () => {
    setSyncState("syncing");
    try {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message || copy.notices.signedOutFailed);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setSyncState("offline");
      showToast({
        title: error instanceof Error ? error.message : copy.notices.signedOutFailed,
        status: "error",
      });
    }
  };

  const openImport = (source: "wechat" | "alipay") => {
    setImportSource(source);
    setMobileSheet(null);
    setDialog("import");
  };

  const openExpense = () => {
    setMobileSheet(null);
    setDialog("expense");
  };

  return (
    <div className="min-h-dvh bg-[#f3f1e9] text-[#17352e]">
      <DesktopSidebar
        snapshot={snapshot}
        selectedGroup={selectedGroup}
        locale={locale}
        copy={copy}
        onPersonal={() => void refreshSnapshot("personal", undefined, snapshot.period.key)}
        onSelectGroup={selectGroup}
        onCreateGroup={() => setDialog("group")}
        onSignOut={() => void signOut()}
        syncing={syncState === "syncing"}
      />

      <main className="min-h-dvh lg:pl-[252px]">
        <header className="sticky top-0 z-30 border-b border-[#173f35]/8 bg-[#f3f1e9]/92 backdrop-blur-xl">
          <div className="mx-auto grid min-h-16 max-w-[1500px] grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-2 gap-y-1 px-4 py-2 sm:px-6 lg:flex lg:h-16 lg:flex-nowrap lg:gap-3 lg:px-8 lg:py-0">
            <MotionButton
              variant="ghost"
              size="icon"
              className="size-11 rounded-xl lg:hidden"
              onClick={() => setMobileSheet("menu")}
              aria-label={copy.navigation.openMenu}
            >
              <Menu className="size-5" />
            </MotionButton>

            <Tabs
              value={snapshot.scope}
              onValueChange={(value) => switchScope(value as DashboardScope)}
              variant="segment"
              className="justify-self-center lg:ml-0"
            >
              <TabsList className="bg-[#e7e6de]">
                <TabsTrigger value="personal" className="min-h-10 px-3 sm:px-4">
                  {copy.scope.personal}
                </TabsTrigger>
                <TabsTrigger value="group" className="min-h-10 px-3 sm:px-4">
                  {copy.scope.group}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="hidden min-w-px flex-1 lg:block" />

            <div className="col-start-3 row-start-1 lg:order-2">
              <SyncButton
                state={syncState}
                label={copy.sync.refresh}
                onRefresh={() => void refreshSnapshot()}
              />
            </div>

            <div className="col-span-3 row-start-2 flex justify-center lg:order-1">
              <MonthControl
                month={snapshot.period.key}
                monthOptions={monthOptions}
                locale={locale}
                copy={copy}
                onSelect={selectMonth}
              />
            </div>
          </div>
        </header>

        <PullToRefresh
          onRefresh={() => refreshSnapshot()}
          refreshing={syncState === "syncing"}
          pullingLabel={copy.sync.pull}
          releaseLabel={copy.sync.release}
          refreshingLabel={copy.sync.refreshing}
          ariaLabel={copy.sync.refresh}
          className="lg:h-[calc(100dvh-4rem)]"
          contentClassName="min-h-[calc(100dvh-4rem)]"
        >
          <motion.div
            key={`${snapshot.scope}-${snapshot.period.key}-${snapshot.selectedGroupId ?? "personal"}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.22 }}
            className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 pb-28 sm:px-6 sm:py-7 lg:px-8 lg:pb-10"
          >
            <div className="flex items-end justify-between gap-3 lg:hidden">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a786f]">
                  {snapshot.scope === "group" ? selectedGroup?.name ?? copy.scope.group : copy.navigation.personalWallet}
                </p>
                <h1 className="mt-1 truncate text-2xl font-semibold tracking-[-0.05em]">
                  {monthTitle}
                </h1>
              </div>
            </div>

            <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
              <HeroCard
                snapshot={snapshot}
                locale={locale}
                monthTitle={monthTitle}
                copy={copy}
                remainingFen={remainingFen}
                budgetRatio={budgetRatio}
                onSetBudget={() => setDialog("budget")}
              />
              <QuickActions
                copy={copy}
                onExpense={openExpense}
                onWechat={() => openImport("wechat")}
                onAlipay={() => openImport("alipay")}
                onGroup={() => setDialog("group")}
              />
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={Utensils}
                label={copy.metrics.averageRestaurant}
                value={snapshot.metrics.averageRestaurantPaymentFen === null
                  ? copy.metrics.noData
                  : formatCny(snapshot.metrics.averageRestaurantPaymentFen, false, locale)}
                detail={`${snapshot.metrics.restaurantPaymentCount} ${copy.metrics.restaurantPayments}`}
                tone="lime"
              />
              <MetricCard
                icon={ShoppingBasket}
                label={copy.metrics.groceries}
                value={formatCny(snapshot.metrics.groceriesSpendFen, false, locale)}
                detail={categoryPercent(snapshot, "groceries", locale)}
                tone="aqua"
              />
              <MetricCard
                icon={CircleDollarSign}
                label={snapshot.metrics.availablePerDayFen === null
                  ? copy.metrics.averagePerDay
                  : copy.metrics.availablePerDay}
                value={formatCny(
                  snapshot.metrics.availablePerDayFen ?? snapshot.metrics.averageDailySpendFen ?? 0,
                  false,
                  locale,
                )}
                detail={snapshot.budgetFen > 0 ? copy.hero.monthlyBudget : copy.hero.exactTotal}
                tone="sand"
              />
              <MetricCard
                icon={CalendarDays}
                label={copy.metrics.largestDay}
                value={snapshot.biggestDay
                  ? formatCny(snapshot.biggestDay.amountFen, false, locale)
                  : copy.metrics.noData}
                detail={snapshot.biggestDay ? formatShortDate(snapshot.biggestDay.date, locale) : "—"}
                tone="peach"
              />
            </section>

            <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
              <SixMonthTrendChart trend={snapshot.trend} locale={locale} copy={copy.charts} />
              <CategoryBreakdown
                snapshot={snapshot}
                locale={locale}
                copy={copy}
                selected={transactionFilter}
                onSelect={(category) => {
                  setTransactionFilter(category);
                  document.querySelector("#transactions")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            </section>

            <section className={cn(
              "grid min-w-0 gap-4",
              snapshot.scope === "group" && "xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]",
            )}>
              <TransactionsCard
                snapshot={snapshot}
                locale={locale}
                copy={copy}
                query={query}
                onQueryChange={setQuery}
                filter={transactionFilter}
                onFilterChange={setTransactionFilter}
                transactions={displayedTransactions}
                expanded={showAllTransactions}
                onToggleExpanded={() => setShowAllTransactions((current) => !current)}
                onShare={(transaction) => {
                  setSelectedTransaction(transaction);
                  setDialog("share");
                }}
              />

              {snapshot.scope === "group" ? (
                <BalancesCard
                  balances={snapshot.balances}
                  locale={locale}
                  copy={copy}
                  onInvite={() => setDialog("member")}
                  onSettle={(member) => {
                    setSelectedBalance(member);
                    setDialog("settlement");
                  }}
                />
              ) : null}
            </section>
          </motion.div>
        </PullToRefresh>
      </main>

      <MotionButton
        size="lg"
        ripple
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 rounded-2xl bg-[#173f35] px-5 text-white shadow-[0_16px_38px_rgba(23,63,53,0.28)] lg:hidden"
        onClick={() => setMobileSheet("actions")}
      >
        <Plus className="size-5" />
        {copy.actions.add}
      </MotionButton>

      <MobileMenuSheet
        open={mobileSheet === "menu"}
        onOpenChange={(open) => setMobileSheet(open ? "menu" : null)}
        snapshot={snapshot}
        copy={copy}
        languageLabel={messages.language.label}
        onPersonal={() => {
          setMobileSheet(null);
          void refreshSnapshot("personal", undefined, snapshot.period.key);
        }}
        onSelectGroup={selectGroup}
        onCreateGroup={() => {
          setMobileSheet(null);
          setDialog("group");
        }}
        onSignOut={() => void signOut()}
      />

      <BottomSheet
        open={mobileSheet === "actions"}
        onOpenChange={(open) => setMobileSheet(open ? "actions" : null)}
        snapPoints={["auto"]}
        title={copy.actions.title}
        closeLabel={copy.navigation.closeSheet}
      >
        <div className="grid gap-2 pt-2">
          <SheetAction icon={PencilLine} label={copy.actions.addExpense} onClick={openExpense} />
          <SheetAction icon={SiWechat} label={copy.actions.importWechat} onClick={() => openImport("wechat")} brand="wechat" />
          <SheetAction icon={SiAlipay} label={copy.actions.importAlipay} onClick={() => openImport("alipay")} brand="alipay" />
          <SheetAction
            icon={Users}
            label={copy.actions.createGroup}
            onClick={() => {
              setMobileSheet(null);
              setDialog("group");
            }}
          />
        </div>
      </BottomSheet>

      <AnimatedToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        position="bottom-center"
        placement="fixed"
        classNames={{ root: "bottom-[calc(5.75rem+env(safe-area-inset-bottom))] lg:bottom-6" }}
      />

      {dialog === "expense" ? (
        <AddExpenseDialog
          open
          onOpenChange={(open) => setDialog(open ? "expense" : null)}
          groups={snapshot.scope === "group" && selectedGroup ? [selectedGroup] : snapshot.groups}
          selectedGroupId={snapshot.scope === "group" ? snapshot.selectedGroupId : undefined}
          members={snapshot.scope === "group" ? snapshot.balances : []}
          month={snapshot.period.key}
          onCreate={addExpense}
        />
      ) : null}
      {dialog === "group" ? (
        <CreateGroupDialog
          open
          month={snapshot.period.key}
          onOpenChange={(open) => setDialog(open ? "group" : null)}
          onCreate={createGroup}
        />
      ) : null}
      {dialog === "import" ? (
        <ImportWalletDialog
          open
          onOpenChange={(open) => setDialog(open ? "import" : null)}
          initialSource={importSource}
          onPreview={async (source, file) => {
            if (demoMode) {
              const accepted = Math.max(8, Math.min(640, Math.round(file.size / 180)));
              return {
                importId: `demo-${source}-${Date.now()}`,
                accepted,
                duplicates: Math.round(accepted * 0.07),
                rejected: Math.round(accepted * 0.01),
                totalFen: accepted * 3_480,
              };
            }
            const form = new FormData();
            form.set("source", source);
            form.set("file", file);
            const response = await fetch("/api/imports/preview", { method: "POST", body: form });
            return readJson<{
              importId: string;
              accepted: number;
              duplicates: number;
              rejected: number;
              totalFen: number;
            }>(response, copy.notices.serverError);
          }}
          onConfirm={async (preview) => {
            if (demoMode) {
              setSnapshot((current) => ({ ...current, revision: current.revision + 1 }));
              showToast({ title: copy.notices.expenseAdded, status: "success" });
              return;
            }
            setSyncState("syncing");
            invalidatePendingRefresh();
            try {
              const mutationIdentity = `import-confirm:${preview.importId}`;
              const response = await fetch(`/api/imports/${preview.importId}/confirm`, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "idempotency-key": idempotencyKeyFor(mutationIdentity),
                },
                body: "{}",
              });
              await readJson(response, copy.notices.serverError);
              mutationKeysRef.current.delete(mutationIdentity);
              await refreshSnapshot();
              showToast({ title: copy.dialogs.import.complete, status: "success" });
            } catch (error) {
              setSyncState("offline");
              throw error;
            }
          }}
        />
      ) : null}
      {dialog === "member" ? (
        <AddMemberDialog
          open
          onOpenChange={(open) => setDialog(open ? "member" : null)}
          groupName={selectedGroup?.name ?? copy.scope.group}
          onInvite={inviteMember}
        />
      ) : null}
      {dialog === "budget" ? (
        <BudgetDialog
          open
          onOpenChange={(open) => setDialog(open ? "budget" : null)}
          currentBudgetFen={snapshot.budgetFen}
          onSave={updateBudget}
        />
      ) : null}
      {dialog === "settlement" ? (
        <SettlementDialog
          open
          onOpenChange={(open) => setDialog(open ? "settlement" : null)}
          member={selectedBalance}
          currentUserBalanceFen={currentUserBalanceFen}
          onSettle={settleBalance}
        />
      ) : null}
      {dialog === "share" ? (
        <ShareTransactionDialog
          open
          onOpenChange={(open) => {
            setDialog(open ? "share" : null);
            if (!open) setSelectedTransaction(null);
          }}
          transaction={selectedTransaction}
          groups={snapshot.groups}
          selectedGroupId={snapshot.scope === "group" ? snapshot.selectedGroupId : undefined}
          onShare={async (groupId) => {
            if (!selectedTransaction) throw new Error(copy.notices.serverError);
            await shareTransaction(selectedTransaction, groupId);
          }}
        />
      ) : null}
    </div>
  );
}

function DesktopSidebar({
  snapshot,
  selectedGroup,
  locale,
  copy,
  onPersonal,
  onSelectGroup,
  onCreateGroup,
  onSignOut,
  syncing,
}: {
  readonly snapshot: DashboardSnapshot;
  readonly selectedGroup?: DashboardGroup;
  readonly locale: "en" | "fr";
  readonly copy: ReturnType<typeof useI18n>["messages"]["dashboard"];
  readonly onPersonal: () => void;
  readonly onSelectGroup: (group: DashboardGroup) => void;
  readonly onCreateGroup: () => void;
  readonly onSignOut: () => void;
  readonly syncing: boolean;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col border-r border-white/8 bg-[#173f35] px-4 py-5 text-white lg:flex">
      <div className="flex items-center gap-3 px-2">
        <Image
          src="/assets/fen-logo-mark-v2.png"
          alt=""
          width={44}
          height={44}
          className="rounded-[15px]"
        />
        <div>
          <p className="text-xl font-semibold tracking-[-0.05em]">Fēn</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-white/45">
            {formatMonthKey(snapshot.period.key, locale, "long")}
          </p>
        </div>
      </div>

      <nav className="mt-8 space-y-1" aria-label={copy.navigation.overview}>
        <SidebarButton
          active={snapshot.scope === "personal"}
          icon={WalletCards}
          label={copy.navigation.personalWallet}
          onClick={onPersonal}
        />
      </nav>

      <div className="mt-7 flex items-center justify-between px-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">
          {copy.navigation.groups}
        </p>
        <MotionButton
          variant="ghost"
          size="icon"
          className="size-10 rounded-xl text-white/65 hover:bg-white/8 hover:text-white"
          onClick={onCreateGroup}
          aria-label={copy.navigation.addGroup}
        >
          <Plus className="size-4" />
        </MotionButton>
      </div>

      <div className="mt-1 space-y-1 overflow-y-auto">
        {snapshot.groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelectGroup(group)}
            className={cn(
              "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors",
              snapshot.scope === "group" && selectedGroup?.id === group.id
                ? "bg-white/11 text-white"
                : "text-white/62 hover:bg-white/6 hover:text-white",
            )}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: group.accent }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{group.name}</span>
              <span className="block truncate text-[11px] text-white/40">{group.memberCount} · {group.city}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-auto space-y-3 border-t border-white/9 pt-4">
        <LanguageSwitcher className="w-full justify-center border-white/8 bg-white/7 shadow-none [&_button[aria-pressed='false']]:text-white/60 [&_button[aria-pressed='false']]:hover:bg-white/8 [&_button[aria-pressed='false']]:hover:text-white" />
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.055] p-2.5">
          <Avatar className="size-9 border border-white/12">
            <AvatarImage src={snapshot.viewer.avatarUrl} alt="" />
            <AvatarFallback className="bg-[#c9ff63] text-xs font-bold text-[#173f35]">
              {initials(snapshot.viewer.name, locale)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{snapshot.viewer.name}</span>
            <span className="block truncate text-[10px] text-white/38">{snapshot.viewer.email}</span>
          </span>
          <MotionButton
            variant="ghost"
            size="icon"
            className="size-10 rounded-xl text-white/52 hover:bg-white/8 hover:text-white"
            onClick={onSignOut}
            disabled={syncing}
            aria-label={copy.account.signOut}
          >
            <LogOut className="size-4" />
          </MotionButton>
        </div>
      </div>
    </aside>
  );
}

function SidebarButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly icon: typeof WalletCards;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors",
        active ? "bg-[#c9ff63] text-[#173f35]" : "text-white/60 hover:bg-white/6 hover:text-white",
      )}
    >
      <Icon className="size-4.5" />
      {label}
    </button>
  );
}

function MonthControl({
  month,
  monthOptions,
  locale,
  copy,
  onSelect,
}: {
  readonly month: string;
  readonly monthOptions: readonly string[];
  readonly locale: "en" | "fr";
  readonly copy: ReturnType<typeof useI18n>["messages"]["dashboard"];
  readonly onSelect: (month: string) => void;
}) {
  const current = currentMonthKey();
  return (
    <div className="flex items-center gap-1">
      <MotionButton
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 rounded-xl sm:size-10"
        onClick={() => onSelect(shiftMonth(month, -1))}
        aria-label={copy.month.previous}
      >
        <ChevronLeft className="size-4" />
      </MotionButton>
      <Select value={month} onValueChange={onSelect} className="w-[150px] sm:w-[172px]">
        <SelectTrigger className="min-h-11 border-[#173f35]/10 bg-white/72 px-3 font-semibold shadow-sm">
          <SelectValue placeholder={copy.month.label} />
        </SelectTrigger>
        <SelectContent className="max-h-72 overflow-y-auto">
          {monthOptions.map((value) => (
            <SelectItem key={value} value={value}>
              {formatMonthTitle(value, locale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <MotionButton
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 rounded-xl sm:size-10"
        onClick={() => onSelect(shiftMonth(month, 1))}
        disabled={month >= current}
        aria-label={copy.month.next}
      >
        <ChevronRight className="size-4" />
      </MotionButton>
    </div>
  );
}

function SyncButton({
  state,
  label,
  onRefresh,
}: {
  readonly state: "synced" | "syncing" | "offline";
  readonly label: string;
  readonly onRefresh: () => void;
}) {
  const Icon = state === "offline" ? CloudOff : state === "synced" ? Check : RefreshCw;
  return (
    <MotionButton
      variant="ghost"
      size="icon"
      className={cn(
        "size-11 rounded-xl",
        state === "offline" && "text-[#b14f38]",
      )}
      onClick={onRefresh}
      disabled={state === "syncing"}
      aria-label={label}
    >
      <Icon className={cn("size-4.5", state === "syncing" && "animate-spin")} />
    </MotionButton>
  );
}

function HeroCard({
  snapshot,
  locale,
  monthTitle,
  copy,
  remainingFen,
  budgetRatio,
  onSetBudget,
}: {
  readonly snapshot: DashboardSnapshot;
  readonly locale: "en" | "fr";
  readonly monthTitle: string;
  readonly copy: ReturnType<typeof useI18n>["messages"]["dashboard"];
  readonly remainingFen: number;
  readonly budgetRatio: number;
  readonly onSetBudget: () => void;
}) {
  const delta = snapshot.metrics.previousMonthDelta;

  return (
    <article className="min-w-0 overflow-hidden rounded-[28px] bg-[#173f35] text-white shadow-[0_22px_60px_rgba(23,63,53,0.15)]">
      <div className="px-5 pt-5 sm:px-7 sm:pt-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/48">
              {copy.hero.spent} {monthTitle}
            </p>
            <NumberTicker
              value={snapshot.spentFen / 100}
              startOnView={false}
              blur
              format={(value) => new Intl.NumberFormat(getIntlLocale(locale), {
                style: "currency",
                currency: "CNY",
                maximumFractionDigits: 0,
              }).format(value)}
              className="mt-3 text-[clamp(2.5rem,8vw,4.9rem)] font-semibold leading-none tracking-[-0.07em]"
            />
            <p className="mt-2 text-xs text-white/48">{formatCny(snapshot.spentFen, false, locale)}</p>
          </div>
          {delta !== null ? (
            <span
              aria-label={`${formatPercent(Math.abs(delta), locale)} ${copy.hero.comparedWithPrevious}`}
              title={copy.hero.comparedWithPrevious}
              className={cn(
              "mt-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold",
              delta <= 0 ? "bg-[#c9ff63]/14 text-[#d9ff92]" : "bg-[#ffad78]/14 text-[#ffc5a0]",
              )}
            >
              {delta <= 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
              {formatPercent(Math.abs(delta), locale)}
            </span>
          ) : null}
        </div>

        <DailySpendingChart
          daily={snapshot.daily}
          spentFen={snapshot.spentFen}
          locale={locale}
          copy={copy.charts}
        />
      </div>

      <div className="border-t border-white/9 bg-black/6 px-5 py-4 sm:px-7">
        {snapshot.budgetFen > 0 ? (
          <button type="button" onClick={onSetBudget} className="block w-full text-left">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="font-semibold text-white/72">{copy.hero.monthlyBudget}</span>
              <span className="text-right tabular-nums text-white/58">
                {remainingFen >= 0
                  ? `${formatCny(remainingFen, true, locale)} ${copy.hero.remaining}`
                  : `${formatCny(Math.abs(remainingFen), true, locale)} ${copy.hero.overBudget}`}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, budgetRatio * 100)}%` }}
                className={cn("h-full rounded-full", budgetRatio > 1 ? "bg-[#ff9e68]" : "bg-[#c9ff63]")}
              />
            </div>
          </button>
        ) : (
          <MotionButton
            variant="ghost"
            className="h-11 w-full justify-between rounded-xl px-0 text-white/70 hover:bg-transparent hover:text-white"
            onClick={onSetBudget}
          >
            {copy.hero.noBudget}
            <span className="font-semibold text-[#c9ff63]">{copy.hero.setBudget}</span>
          </MotionButton>
        )}
      </div>
    </article>
  );
}

function QuickActions({
  copy,
  onExpense,
  onWechat,
  onAlipay,
  onGroup,
}: {
  readonly copy: ReturnType<typeof useI18n>["messages"]["dashboard"];
  readonly onExpense: () => void;
  readonly onWechat: () => void;
  readonly onAlipay: () => void;
  readonly onGroup: () => void;
}) {
  return (
    <article className="rounded-[28px] border border-[#173f35]/8 bg-[#fffdf7] p-5 shadow-[0_16px_45px_rgba(23,63,53,0.07)] sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a786f]">{copy.actions.title}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-1">
        <QuickAction icon={PencilLine} label={copy.actions.addExpense} onClick={onExpense} primary />
        <QuickAction icon={SiWechat} label={copy.actions.importWechat} onClick={onWechat} brand="wechat" />
        <QuickAction icon={SiAlipay} label={copy.actions.importAlipay} onClick={onAlipay} brand="alipay" />
        <QuickAction icon={Users} label={copy.actions.createGroup} onClick={onGroup} />
      </div>
    </article>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  primary = false,
  brand,
}: {
  readonly icon: typeof PencilLine;
  readonly label: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
  readonly brand?: "wechat" | "alipay";
}) {
  return (
    <MotionButton
      variant={primary ? "primary" : "secondary"}
      size="lg"
      ripple={primary}
      onClick={onClick}
      className={cn(
        "h-14 justify-start rounded-2xl px-2.5 text-left text-xs font-semibold sm:px-3.5 sm:text-[13px]",
        !primary && "bg-white",
      )}
    >
      <span className={cn(
        "grid size-8 shrink-0 place-items-center rounded-xl",
        primary && "bg-white/10",
        brand === "wechat" && "bg-[#07c160]/12 text-[#07964c]",
        brand === "alipay" && "bg-[#1677ff]/10 text-[#1677ff]",
        !primary && !brand && "bg-[#edf0e8] text-[#436057]",
      )}>
        <Icon className="size-4" />
      </span>
      <span className="line-clamp-2 min-w-0 whitespace-normal leading-[1.15]">{label}</span>
    </MotionButton>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  readonly icon: typeof Utensils;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: "lime" | "aqua" | "sand" | "peach";
}) {
  const tones = {
    lime: "bg-[#edf6dc] text-[#46672d]",
    aqua: "bg-[#e4f2ef] text-[#39746d]",
    sand: "bg-[#f1ecdf] text-[#7b6743]",
    peach: "bg-[#f8e9df] text-[#9b5f3d]",
  };
  return (
    <article className="rounded-[22px] border border-[#173f35]/8 bg-[#fffdf8] p-4 shadow-[0_10px_32px_rgba(23,63,53,0.045)] sm:p-5">
      <span className={cn("grid size-9 place-items-center rounded-xl", tones[tone])}>
        <Icon className="size-4.5" />
      </span>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#718078]">{label}</p>
      <p className="mt-1.5 truncate text-xl font-semibold tracking-[-0.045em] tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-1 truncate text-xs text-[#7b8780]">{detail}</p>
    </article>
  );
}

function CategoryBreakdown({
  snapshot,
  locale,
  copy,
  selected,
  onSelect,
}: {
  readonly snapshot: DashboardSnapshot;
  readonly locale: "en" | "fr";
  readonly copy: ReturnType<typeof useI18n>["messages"]["dashboard"];
  readonly selected: TransactionCategory | "all";
  readonly onSelect: (category: TransactionCategory) => void;
}) {
  const max = Math.max(...snapshot.categories.map((item) => item.amountFen), 1);
  return (
    <article className="rounded-[26px] border border-[#173f35]/8 bg-[#fffdf8] p-5 shadow-[0_12px_36px_rgba(23,63,53,0.05)] sm:p-6">
      <CardHeading title={copy.charts.categories} description={copy.charts.categoriesDescription} />
      <div className="mt-5 space-y-3">
        {snapshot.categories.length ? snapshot.categories.map((item) => {
          const Icon = categoryIcons[item.category];
          return (
            <button
              key={item.category}
              type="button"
              onClick={() => onSelect(item.category)}
              aria-pressed={selected === item.category}
              className={cn(
                "group block min-h-12 w-full rounded-xl px-2 py-1.5 text-left transition-colors",
                selected === item.category ? "bg-[#edf3e5]" : "hover:bg-[#f1f0e9]",
              )}
            >
              <span className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-lg bg-[#f0efe8] text-[#617269]">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{copy.categories[item.category]}</span>
                <span className="text-xs font-semibold tabular-nums">{formatCny(item.amountFen, true, locale)}</span>
              </span>
              <span className="ml-9 mt-1.5 block h-1 overflow-hidden rounded-full bg-[#e5e3da]">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${(item.amountFen / max) * 100}%` }}
                  className="block h-full rounded-full"
                  style={{ backgroundColor: categoryColors[item.category] }}
                />
              </span>
            </button>
          );
        }) : (
          <p className="py-10 text-center text-sm text-[#75817a]">{copy.metrics.noData}</p>
        )}
      </div>
    </article>
  );
}

function TransactionsCard({
  snapshot,
  locale,
  copy,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  transactions,
  expanded,
  onToggleExpanded,
  onShare,
}: {
  readonly snapshot: DashboardSnapshot;
  readonly locale: "en" | "fr";
  readonly copy: ReturnType<typeof useI18n>["messages"]["dashboard"];
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly filter: TransactionCategory | "all";
  readonly onFilterChange: (value: TransactionCategory | "all") => void;
  readonly transactions: readonly DashboardTransaction[];
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly onShare: (transaction: DashboardTransaction) => void;
}) {
  const filters: Array<TransactionCategory | "all"> = [
    "all",
    ...snapshot.categories.map((item) => item.category),
  ];
  const filteredCount = snapshot.transactions.filter((item) => filter === "all" || item.category === filter).length;
  return (
    <article id="transactions" className="min-w-0 scroll-mt-24 rounded-[26px] border border-[#173f35]/8 bg-[#fffdf8] shadow-[0_12px_36px_rgba(23,63,53,0.05)]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <CardHeading title={copy.transactions.title} description={copy.transactions.description} />
          <MotionInput
            value={query}
            onChange={onQueryChange}
            placeholder={copy.transactions.search}
            aria-label={copy.transactions.search}
            leftIcon={<Search />}
            className="w-full sm:w-64"
            classNames={{
              field: "h-11 rounded-xl border-[#173f35]/10 bg-white",
              input: "text-base sm:text-sm",
            }}
          />
        </div>

        <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-1">
          <Tabs value={filter} onValueChange={(value) => onFilterChange(value as TransactionCategory | "all")} variant="pill">
            <TabsList className="w-max bg-[#efeee7]">
              {filters.map((category) => (
                <TabsTrigger key={category} value={category} className="min-h-9 text-xs">
                  {copy.categories[category]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="border-t border-[#173f35]/7">
        {transactions.length ? transactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            locale={locale}
            copy={copy}
            onShare={() => onShare(transaction)}
          />
        )) : (
          <div className="grid min-h-40 place-items-center px-6 text-center text-sm text-[#738078]">
            {copy.transactions.empty}
          </div>
        )}
      </div>

      {filteredCount > 6 ? (
        <div className="border-t border-[#173f35]/7 p-3 text-center">
          <MotionButton variant="ghost" className="min-h-11 rounded-xl" onClick={onToggleExpanded}>
            {expanded ? copy.transactions.showLess : copy.transactions.showMore}
          </MotionButton>
        </div>
      ) : null}
    </article>
  );
}

function TransactionRow({
  transaction,
  locale,
  copy,
  onShare,
}: {
  readonly transaction: DashboardTransaction;
  readonly locale: "en" | "fr";
  readonly copy: ReturnType<typeof useI18n>["messages"]["dashboard"];
  readonly onShare: () => void;
}) {
  const Icon = categoryIcons[transaction.category];
  return (
    <div className="flex min-h-[76px] items-center gap-3 border-b border-[#173f35]/6 px-4 py-3 last:border-0 sm:px-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#efeee7] text-[#587067]">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{transaction.title}</span>
          <span className="shrink-0 text-[#718078]">{sourceIcon(transaction.source)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-[#7b8780]">
          {transaction.merchant || copy.categories[transaction.category]} · {formatDateTime(transaction.occurredAt, locale)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">{formatCny(transaction.amountFen, false, locale)}</span>
        {transaction.shared ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#5f7d48]">
            <Check className="size-3" /> {copy.transactions.shared}
          </span>
        ) : (
          <button
            type="button"
            onClick={onShare}
            className="mt-1 inline-flex min-h-7 items-center gap-1 rounded-lg px-1.5 text-[11px] font-semibold text-[#536c62] hover:bg-[#edf1e7] hover:text-[#173f35]"
          >
            <Share2 className="size-3" /> {copy.transactions.share}
          </button>
        )}
      </span>
    </div>
  );
}

function BalancesCard({
  balances,
  locale,
  copy,
  onInvite,
  onSettle,
}: {
  readonly balances: readonly MemberBalance[];
  readonly locale: "en" | "fr";
  readonly copy: ReturnType<typeof useI18n>["messages"]["dashboard"];
  readonly onInvite: () => void;
  readonly onSettle: (member: MemberBalance) => void;
}) {
  return (
    <article className="rounded-[26px] border border-[#173f35]/8 bg-[#fffdf8] p-5 shadow-[0_12px_36px_rgba(23,63,53,0.05)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <CardHeading title={copy.balances.title} description={copy.balances.description} />
        <MotionButton
          variant="ghost"
          size="icon"
          className="size-11 rounded-xl"
          onClick={onInvite}
          aria-label={copy.balances.invite}
        >
          <UserPlus className="size-4" />
        </MotionButton>
      </div>
      <div className="mt-5 space-y-2">
        {balances.length ? balances.map((member) => (
          <div key={member.id} className="flex min-h-14 items-center gap-3 rounded-2xl bg-[#f3f1e9] px-3 py-2.5">
            <Avatar className="size-9">
              <AvatarImage src={member.avatarUrl} alt="" />
              <AvatarFallback className="bg-white text-xs font-bold text-[#365449]">
                {initials(member.name, locale)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{member.name}</span>
              <span className={cn(
                "block text-[11px] font-medium",
                member.balanceFen > 0 ? "text-[#4e7a41]" : member.balanceFen < 0 ? "text-[#a45f3f]" : "text-[#7a867f]",
              )}>
                {member.balanceFen === 0
                  ? copy.balances.settled
                  : `${member.balanceFen > 0 ? copy.balances.receives : copy.balances.owes} ${formatCny(Math.abs(member.balanceFen), false, locale)}`}
              </span>
            </span>
            {!member.isCurrentUser && member.balanceFen !== 0 ? (
              <MotionButton variant="ghost" size="sm" className="min-h-10 rounded-xl px-2.5" onClick={() => onSettle(member)}>
                {copy.balances.settle}
              </MotionButton>
            ) : null}
          </div>
        )) : (
          <p className="py-8 text-center text-sm text-[#75817a]">{copy.balances.empty}</p>
        )}
      </div>
    </article>
  );
}

function MobileMenuSheet({
  open,
  onOpenChange,
  snapshot,
  copy,
  languageLabel,
  onPersonal,
  onSelectGroup,
  onCreateGroup,
  onSignOut,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly snapshot: DashboardSnapshot;
  readonly copy: ReturnType<typeof useI18n>["messages"]["dashboard"];
  readonly languageLabel: string;
  readonly onPersonal: () => void;
  readonly onSelectGroup: (group: DashboardGroup) => void;
  readonly onCreateGroup: () => void;
  readonly onSignOut: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[0.76, 0.92]}
      title={copy.navigation.overview}
      closeLabel={copy.navigation.closeMenu}
    >
      <div className="space-y-5 pt-2">
        <button
          type="button"
          onClick={onPersonal}
          className={cn(
            "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-semibold",
            snapshot.scope === "personal" ? "bg-[#173f35] text-white" : "bg-[#efeee7]",
          )}
        >
          <WalletCards className="size-5" />
          {copy.navigation.personalWallet}
        </button>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#718078]">{copy.navigation.groups}</p>
            <MotionButton variant="ghost" size="sm" className="min-h-10 rounded-xl" onClick={onCreateGroup}>
              <Plus className="size-4" /> {copy.navigation.addGroup}
            </MotionButton>
          </div>
          <div className="space-y-1">
            {snapshot.groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onSelectGroup(group)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left",
                  snapshot.scope === "group" && snapshot.selectedGroupId === group.id
                    ? "bg-[#edf4df]"
                    : "hover:bg-[#f1f0e9]",
                )}
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: group.accent }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{group.name}</span>
                  <span className="block text-xs text-[#75817a]">{group.city} · {group.memberCount}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#68776f]">
            <Languages className="size-4" /> {languageLabel}
          </span>
          <LanguageSwitcher />
        </div>
        <MotionButton variant="outline" size="lg" className="w-full rounded-2xl" onClick={onSignOut}>
          <LogOut className="size-4" /> {copy.account.signOut}
        </MotionButton>
      </div>
    </BottomSheet>
  );
}

function SheetAction({
  icon: Icon,
  label,
  onClick,
  brand,
}: {
  readonly icon: typeof PencilLine;
  readonly label: string;
  readonly onClick: () => void;
  readonly brand?: "wechat" | "alipay";
}) {
  return (
    <MotionButton
      variant="secondary"
      size="lg"
      className="h-14 w-full justify-start rounded-2xl bg-white px-3.5"
      onClick={onClick}
    >
      <span className={cn(
        "grid size-9 place-items-center rounded-xl bg-[#edf0e8] text-[#436057]",
        brand === "wechat" && "bg-[#07c160]/12 text-[#07964c]",
        brand === "alipay" && "bg-[#1677ff]/10 text-[#1677ff]",
      )}>
        <Icon className="size-4.5" />
      </span>
      {label}
    </MotionButton>
  );
}

function CardHeading({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.035em]">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-[#738078]">{description}</p>
    </div>
  );
}

function sourceIcon(source: TransactionSource) {
  if (source === "wechat") return <SiWechat className="size-3.5" aria-hidden />;
  if (source === "alipay") return <SiAlipay className="size-3.5" aria-hidden />;
  return <PencilLine className="size-3.5" aria-hidden />;
}

function formatMonthTitle(month: string, locale: "en" | "fr") {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function categoryPercent(snapshot: DashboardSnapshot, category: TransactionCategory, locale: "en" | "fr") {
  const amount = snapshot.categories.find((item) => item.category === category)?.amountFen ?? 0;
  return snapshot.spentFen > 0 ? formatPercent(amount / snapshot.spentFen, locale) : "0%";
}
