"use client";

import { SiAlipay, SiWechat } from "@icons-pack/react-simple-icons";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudOff,
  Coffee,
  Ellipsis,
  FileUp,
  HeartPulse,
  Home,
  House,
  Landmark,
  LogOut,
  Menu,
  MoreHorizontal,
  PencilLine,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  TrainFront,
  UserPlus,
  Users,
  Utensils,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AddExpenseDialog,
  AddMemberDialog,
  BudgetDialog,
  CreateGroupDialog,
  ImportWalletDialog,
  ShareTransactionDialog,
  SettlementDialog,
  type AddExpensePayload,
  type CreateGroupPayload,
} from "@/components/dashboard/dashboard-dialogs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createDemoDashboard } from "@/lib/dashboard/demo";
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
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

interface YearDashboardProps {
  readonly initialData: DashboardSnapshot;
  readonly demoMode?: boolean;
}

type DialogName = "expense" | "group" | "import" | "member" | "budget" | "settlement" | "share" | null;

const categoryIcons: Record<TransactionCategory, typeof Utensils> = {
  food: Utensils,
  transport: TrainFront,
  housing: House,
  shopping: ShoppingBag,
  leisure: Coffee,
  travel: Plane,
  health: HeartPulse,
  other: Sparkles,
};

const categoryLabels: Record<TransactionCategory, string> = {
  food: "Restaurants & courses",
  transport: "Transports",
  housing: "Logement",
  shopping: "Shopping",
  leisure: "Loisirs",
  travel: "Voyages",
  health: "Santé",
  other: "Autres",
};

function formatAmount(fen: number, compact = false) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
  }).format(fen / 100);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(date));
}

function formatDayMonth(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Shanghai",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

function sourceIcon(source: TransactionSource, className = "size-4") {
  if (source === "wechat") return <SiWechat className={className} aria-hidden />;
  if (source === "alipay") return <SiAlipay className={className} aria-hidden />;
  return <PencilLine className={className} aria-hidden />;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string | { message?: string } })
    | null;
  if (!response.ok) {
    const serverError = payload?.error;
    const message = typeof serverError === "string" ? serverError : serverError?.message;
    throw new Error(message ?? "Le serveur n’a pas pu terminer cette action.");
  }
  if (!payload) throw new Error("Réponse serveur invalide.");
  return payload;
}

export function YearDashboard({ initialData, demoMode = false }: YearDashboardProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialData);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [importSource, setImportSource] = useState<Exclude<TransactionSource, "manual">>("wechat");
  const [selectedBalance, setSelectedBalance] = useState<MemberBalance | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<DashboardTransaction | null>(null);
  const [transactionFilter, setTransactionFilter] = useState<TransactionCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"synced" | "syncing" | "offline">("synced");
  const refreshEpochRef = useRef(new RefreshEpoch());
  const refreshControllerRef = useRef<AbortController | null>(null);
  const noticeSequenceRef = useRef(0);
  const mutationKeysRef = useRef(new Map<string, string>());

  const selectedGroup = snapshot.groups.find((group) => group.id === snapshot.selectedGroupId);
  const budgetRatio = snapshot.budgetFen > 0 ? snapshot.spentFen / snapshot.budgetFen : 0;
  const remainingFen = Math.max(0, snapshot.budgetFen - snapshot.spentFen);
  const currentUserBalanceFen = snapshot.balances.find((member) => member.isCurrentUser)?.balanceFen ?? 0;
  const displayedTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return snapshot.transactions.filter((transaction) => {
      const matchesCategory = transactionFilter === "all" || transaction.category === transactionFilter;
      const matchesQuery = !normalizedQuery || `${transaction.title} ${transaction.merchant}`.toLocaleLowerCase("fr").includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [query, snapshot.transactions, transactionFilter]);

  const showNotice = useCallback((message: string) => {
    const noticeSequence = noticeSequenceRef.current + 1;
    noticeSequenceRef.current = noticeSequence;
    setNotice(message);
    window.setTimeout(() => {
      if (noticeSequence !== noticeSequenceRef.current) return;
      setNotice(null);
      setInvitationLink(null);
    }, 6_000);
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

  const refreshSnapshot = useCallback(async (scope = snapshot.scope, groupId = snapshot.selectedGroupId) => {
    if (demoMode) {
      const next = createDemoDashboard(scope);
      setSnapshot(groupId && scope === "group" ? { ...next, selectedGroupId: groupId } : next);
      return;
    }
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    const requestEpoch = refreshEpochRef.current.begin();
    setSyncState("syncing");
    try {
      const params = new URLSearchParams({ scope });
      if (groupId) params.set("groupId", groupId);
      const response = await fetch(`/api/dashboard?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const next = await readJson<DashboardSnapshot>(response);
      if (!refreshEpochRef.current.isCurrent(requestEpoch)) return;
      setSnapshot(next);
      setSyncState("synced");
    } catch (error) {
      if (controller.signal.aborted || !refreshEpochRef.current.isCurrent(requestEpoch)) return;
      setSyncState("offline");
      showNotice(error instanceof Error ? error.message : "Synchronisation indisponible.");
    } finally {
      if (refreshControllerRef.current === controller) {
        refreshControllerRef.current = null;
      }
    }
  }, [demoMode, showNotice, snapshot.scope, snapshot.selectedGroupId]);

  const mutation = useCallback(async (
    path: string,
    body: unknown,
    demoAction: () => void,
    successMessage: string,
  ) => {
    if (demoMode) {
      demoAction();
      showNotice(successMessage);
      return undefined;
    }
    invalidatePendingRefresh();
    setSyncState("syncing");
    try {
      const mutationIdentity = `${path}:${JSON.stringify(body)}`;
      const idempotencyKey = idempotencyKeyFor(mutationIdentity);
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const payload = await readJson<{ snapshot?: DashboardSnapshot; message?: string }>(response);
      // A focus/timer refresh may have started while the mutation was in flight.
      // Invalidate it again before committing the authoritative mutation result.
      invalidatePendingRefresh();
      mutationKeysRef.current.delete(mutationIdentity);
      if (payload.snapshot) setSnapshot(payload.snapshot);
      else await refreshSnapshot();
      setSyncState("synced");
      showNotice(payload.message ?? successMessage);
      return payload;
    } catch (error) {
      setSyncState("offline");
      throw error;
    }
  }, [demoMode, idempotencyKeyFor, invalidatePendingRefresh, refreshSnapshot, showNotice]);

  const switchScope = (scope: DashboardScope) => {
    if (scope === snapshot.scope) return;
    if (scope === "group" && snapshot.groups.length === 0) {
      setDialog("group");
      showNotice("Crée ton premier tricount pour commencer à partager des dépenses.");
      return;
    }
    setTransactionFilter("all");
    setShowAllTransactions(false);
    void refreshSnapshot(scope, scope === "group" ? selectedGroup?.id ?? snapshot.groups[0]?.id : undefined);
  };

  useEffect(() => {
    if (demoMode) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshSnapshot();
    };
    const interval = window.setInterval(refreshWhenVisible, 20_000);
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
    setMobileNavOpen(false);
    setTransactionFilter("all");
    setShowAllTransactions(false);
    void refreshSnapshot("group", group.id);
  };

  const addExpense = async (payload: AddExpensePayload) => {
    await mutation(
      "/api/expenses",
      payload,
      () => {
      const nextTransaction: DashboardTransaction = {
        id: `demo-${Date.now()}`,
        title: payload.title,
        merchant: "Saisie manuelle",
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
        revision: current.revision + 1,
      }));
      },
      "Dépense ajoutée et soldes recalculés.",
    );
  };

  const createGroup = async (payload: CreateGroupPayload) => {
    const result = await mutation(
      "/api/groups",
      payload,
      () => {
      const group: DashboardGroup = {
        id: `demo-group-${Date.now()}`,
        name: payload.name,
        city: payload.city,
        memberCount: 1 + payload.inviteEmails.length,
        spentFen: 0,
        accent: "#c9ff63",
      };
      setSnapshot((current) => ({ ...current, groups: [...current.groups, group], revision: current.revision + 1 }));
      if (payload.inviteEmails.length) {
        setInvitationLink(payload.inviteEmails.map((email) => `${window.location.origin}/join?token=demo-invitation&email=${encodeURIComponent(email)}`).join("\n"));
      }
      },
      "Tricount créé. Les invitations sont prêtes.",
    );
    const invitationUrls = (result as { invitationUrls?: string[] } | undefined)?.invitationUrls;
    if (invitationUrls?.length) setInvitationLink(invitationUrls.join("\n"));
  };

  const updateBudget = async (budgetFen: number) => {
    await mutation(
      "/api/budgets",
      { budgetFen, startsOn: snapshot.academicYear.startsOn, endsOn: snapshot.academicYear.endsOn, scope: snapshot.scope, groupId: snapshot.selectedGroupId },
      () => setSnapshot((current) => ({ ...current, budgetFen, revision: current.revision + 1 })),
      "Budget annuel mis à jour.",
    );
  };

  const inviteMember = async (email: string) => {
    if (!selectedGroup) throw new Error("Sélectionne d’abord un tricount.");
    if (demoMode) {
      setSnapshot((current) => ({
        ...current,
        groups: current.groups.map((group) => group.id === selectedGroup.id ? { ...group, memberCount: group.memberCount + 1 } : group),
        revision: current.revision + 1,
      }));
      setInvitationLink(`${window.location.origin}/join?token=demo-invitation&email=${encodeURIComponent(email)}`);
      showNotice(`Invitation créée pour ${email}.`);
      return;
    }

    setSyncState("syncing");
    invalidatePendingRefresh();
    try {
      const mutationIdentity = `group-invitation:${selectedGroup.id}:${email}`;
      const response = await fetch(`/api/groups/${selectedGroup.id}/invitations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKeyFor(mutationIdentity),
        },
        body: JSON.stringify({ email }),
      });
      const payload = await readJson<{
        snapshot: DashboardSnapshot;
        invitationUrl?: string;
        message?: string;
      }>(response);
      invalidatePendingRefresh();
      mutationKeysRef.current.delete(mutationIdentity);
      setSnapshot(payload.snapshot);
      setSyncState("synced");
      setInvitationLink(payload.invitationUrl ?? null);
      showNotice(payload.message ?? `Invitation créée pour ${email}.`);
    } catch (error) {
      setSyncState("offline");
      throw error;
    }
  };

  const shareTransaction = async (transaction: DashboardTransaction, groupId: string) => {
    const targetGroup = snapshot.groups.find((group) => group.id === groupId);
    if (!targetGroup) throw new Error("Le tricount choisi n’est plus disponible.");
    await mutation(
      `/api/wallet-transactions/${transaction.id}/share`,
      { groupId: targetGroup.id },
      () => setSnapshot((current) => ({
        ...current,
        transactions: current.transactions.map((item) => item.id === transaction.id ? { ...item, groupId: targetGroup.id, shared: true } : item),
        revision: current.revision + 1,
      })),
      `« ${transaction.title} » est maintenant partagé avec ${targetGroup.name}.`,
    );
  };

  const settleBalance = async (memberId: string, amountFen: number) => {
    if (!selectedGroup) throw new Error("Sélectionne d’abord un tricount.");
    await mutation(
      `/api/groups/${selectedGroup.id}/settlements`,
      { memberId, amountFen },
      () => setSnapshot((current) => ({
        ...current,
        balances: current.balances.map((balance) => balance.id === memberId ? { ...balance, balanceFen: Math.sign(balance.balanceFen) * Math.max(0, Math.abs(balance.balanceFen) - amountFen) } : balance),
        revision: current.revision + 1,
      })),
      "Remboursement enregistré.",
    );
  };

  const signOut = async () => {
    setSyncState("syncing");

    try {
      const { error } = await authClient.signOut();
      if (error) {
        throw new Error(error.message || "La session n’a pas pu être fermée.");
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      setSyncState("offline");
      showNotice(error instanceof Error ? error.message : "Déconnexion impossible. Réessaie dans un instant.");
    }
  };

  return (
    <div className="min-h-dvh bg-[#f3f1e9] text-[#17352e]">
      <DashboardSidebar
        groups={snapshot.groups}
        insight={snapshot.busiestDay}
        selectedGroupId={snapshot.selectedGroupId}
        scope={snapshot.scope}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onCreateGroup={() => setDialog("group")}
        onSelectGroup={selectGroup}
        onSelectPersonal={() => {
          setMobileNavOpen(false);
          switchScope("personal");
        }}
        onOpenWallet={() => {
          setMobileNavOpen(false);
          if (snapshot.scope !== "personal") switchScope("personal");
          window.requestAnimationFrame(() => document.querySelector("#recent-transactions")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }}
        onOpenImports={() => {
          setMobileNavOpen(false);
          setImportSource("wechat");
          setDialog("import");
        }}
      />

      <main className="min-h-dvh lg:pl-[224px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[#e5e2d9]/80 bg-[#f3f1e9]/88 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button type="button" variant="ghost" size="icon" className="rounded-xl lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Ouvrir la navigation">
            <Menu />
          </Button>

          <div className="flex rounded-xl bg-[#e7e6de] p-1" aria-label="Portée du tableau de bord">
            <button
              type="button"
              onClick={() => switchScope("personal")}
              aria-pressed={snapshot.scope === "personal"}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4",
                snapshot.scope === "personal" ? "bg-white text-[#173f35] shadow-sm" : "text-[#778079] hover:text-[#173f35]",
              )}
            >
              Personnel
            </button>
            <button
              type="button"
              onClick={() => switchScope("group")}
              aria-pressed={snapshot.scope === "group"}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4",
                snapshot.scope === "group" ? "bg-white text-[#173f35] shadow-sm" : "text-[#778079] hover:text-[#173f35]",
              )}
            >
              Tricount
            </button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="hidden h-10 rounded-xl px-3 text-xs font-semibold sm:inline-flex">
                <CalendarDays className="size-4 text-[#668077]" />
                {snapshot.academicYear.label}
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 rounded-xl border-[#deddd5] bg-[#fbfaf5] p-2">
              <DropdownMenuLabel>Année académique</DropdownMenuLabel>
              <DropdownMenuItem className="rounded-lg bg-[#eff6df]"><Check /> {snapshot.academicYear.label}</DropdownMenuItem>
              <DropdownMenuItem className="rounded-lg" disabled>2026–2027 · bientôt</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-2">
            <SyncStateBadge state={syncState} onRefresh={() => void refreshSnapshot()} />
            <Button type="button" variant="ghost" size="icon" className="hidden rounded-xl sm:inline-flex" aria-label="Notifications" onClick={() => showNotice("Tout est à jour, aucune nouvelle notification.")}>
              <Bell />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-2 rounded-xl p-1.5 text-left transition hover:bg-white/65" aria-label="Menu du compte">
                  <Avatar className="size-8 ring-2 ring-white">
                    {snapshot.viewer.avatarUrl ? <AvatarImage src={snapshot.viewer.avatarUrl} alt="" /> : null}
                    <AvatarFallback>{initials(snapshot.viewer.name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-xs font-semibold md:block">{snapshot.viewer.name}</span>
                  <ChevronDown className="hidden size-3.5 text-[#778079] md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-xl border-[#deddd5] bg-[#fbfaf5] p-2">
                <DropdownMenuLabel>
                  <span className="block">{snapshot.viewer.name}</span>
                  <span className="mt-1 block truncate text-xs font-normal text-[#778079]">{snapshot.viewer.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-lg" disabled><Settings /> Paramètres · bientôt</DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-lg"
                  onSelect={() => {
                    setImportSource("wechat");
                    setDialog("import");
                  }}
                ><CircleHelp /> Aide pour les exports</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-lg text-[#a8432c]" onSelect={() => void signOut()}><LogOut /> Se déconnecter</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="mx-auto max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8 lg:py-3">
          {syncState === "offline" ? (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#edc9b4] bg-[#fff3e9] px-4 py-3 text-sm text-[#7b4b32]" role="status">
              <CloudOff className="size-4 shrink-0" />
              <p className="flex-1">Hors ligne : les dernières données synchronisées restent visibles.</p>
              <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void refreshSnapshot()}>Réessayer</button>
            </div>
          ) : null}

          <section aria-labelledby="dashboard-title" className="overflow-hidden rounded-[26px] bg-[#173f35] text-white shadow-[0_24px_70px_rgba(23,63,53,0.14)]">
            <div className="grid min-h-[244px] lg:grid-cols-[0.92fr_1.5fr]">
              <div className="relative flex flex-col justify-between border-b border-white/10 px-6 py-6 sm:px-8 lg:border-r lg:border-b-0 lg:px-9 lg:py-6">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#c7d2cc]">
                    <span className="size-2 rounded-full bg-[#c9ff63]" />
                    {snapshot.scope === "personal" ? "Mon année en Chine" : selectedGroup?.name ?? "Mon tricount"}
                  </div>
                  <h1 id="dashboard-title" className="mt-4 text-[clamp(2rem,4vw,4.25rem)] font-semibold leading-[0.92] tracking-[-0.065em] tabular-nums">
                    {formatAmount(snapshot.spentFen, true)}
                  </h1>
                  <p className="mt-3 text-sm text-white/58">dépensés sur la période</p>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{snapshot.budgetFen > 0 ? "Budget restant" : "Budget annuel"}</p>
                    <p className="mt-2 text-lg font-semibold tabular-nums">{snapshot.budgetFen > 0 ? formatAmount(remainingFen, true) : "À définir"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">vs. période passée</p>
                    {snapshot.previousPeriodDelta === null ? (
                      <p className="mt-2 text-sm font-semibold text-white/58">Après une 2e période</p>
                    ) : (
                      <p className={cn("mt-2 flex items-center gap-1 text-lg font-semibold", snapshot.previousPeriodDelta <= 0 ? "text-[#c9ff63]" : "text-[#ffb48a]")}>
                        {snapshot.previousPeriodDelta <= 0 ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
                        {Math.abs(snapshot.previousPeriodDelta * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-4 py-5 sm:px-7 sm:py-6 lg:px-8 lg:py-7">
                <div className="flex items-center justify-between px-2">
                  <div>
                    <p className="text-xs font-semibold">Dépenses mensuelles</p>
                    <p className="mt-1 text-[11px] text-white/45">Barres : réel · ligne : budget</p>
                  </div>
                  <button type="button" onClick={() => setDialog("budget")} className="rounded-lg border border-white/12 px-3 py-2 text-[11px] font-semibold text-white/72 transition hover:bg-white/8 hover:text-white">
                    Modifier le budget
                  </button>
                </div>
                <div className="mt-3 h-[150px] w-full" aria-label="Graphique des dépenses mensuelles et du budget">
                  <MeasuredChart height={150} fallbackWidth={520}>
                    {(width) => <ComposedChart width={width} height={150} data={snapshot.monthly} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.48)", fontSize: 10 }} dy={8} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.36)", fontSize: 9 }} tickFormatter={(value) => `${Math.round(Number(value) / 100_000)}k`} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        content={({ active, payload, label }) => active && payload?.length ? (
                          <div className="rounded-xl border border-white/10 bg-[#0f2e27] px-3 py-2 text-xs shadow-xl">
                            <p className="font-semibold text-white">{label}</p>
                            <p className="mt-1 text-[#c9ff63]">Dépensé · {formatAmount(Number(payload[0]?.value ?? 0), true)}</p>
                            <p className="text-white/55">Budget · {formatAmount(Number(payload[1]?.value ?? 0), true)}</p>
                          </div>
                        ) : null}
                      />
                      <Bar dataKey="spentFen" fill="#c9ff63" radius={[5, 5, 2, 2]} maxBarSize={28} />
                      <Line type="monotone" dataKey="budgetFen" stroke="#f8b36d" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    </ComposedChart>}
                  </MeasuredChart>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-5 grid gap-5 min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
              <section className="grid gap-4 md:grid-cols-[1.35fr_0.65fr]" aria-labelledby="imports-title">
                <div className="rounded-[24px] border border-white bg-[#fbfaf5] p-4 shadow-[0_12px_40px_rgba(50,55,44,0.045)] sm:p-5">
                  <div className="flex items-center gap-2">
                    <h2 id="imports-title" className="text-lg font-semibold tracking-[-0.035em]">Importer mes paiements</h2>
                    <Badge className="border-0 bg-[#edf5dd] text-[#55763c]">Privé</Badge>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-[#708078]">
                    Exports analysés sans doublons ni remboursements oubliés.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <ImportButton source="wechat" onClick={() => { setImportSource("wechat"); setDialog("import"); }} />
                    <ImportButton source="alipay" onClick={() => { setImportSource("alipay"); setDialog("import"); }} />
                  </div>
                  <div className="mt-3 border-t border-[#e8e5dc] pt-3 text-[10px] text-[#7b857f]">
                    <span className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-[#5e8d45]" />
                      {snapshot.imports.reduce((sum, item) => sum + item.transactionCount, 0).toLocaleString("fr-FR")} opérations · fichier brut non conservé
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDialog("expense")}
                  className="group flex min-h-44 flex-col justify-between rounded-[24px] bg-[#c9ff63] p-5 text-left text-[#173f35] shadow-[0_12px_40px_rgba(116,155,62,0.12)] transition hover:-translate-y-0.5 hover:bg-[#bff45e] sm:p-6"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-[#173f35] text-white"><Plus className="size-5" /></span>
                  <span>
                    <strong className="block text-lg tracking-[-0.035em]">Ajouter une dépense</strong>
                    <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#4f7044]">Saisie manuelle <ChevronRight className="size-3.5 transition group-hover:translate-x-0.5" /></span>
                  </span>
                </button>
              </section>

              <section className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
                <div className="rounded-[24px] border border-white bg-[#fbfaf5] p-5 shadow-[0_12px_40px_rgba(50,55,44,0.045)] sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.035em]">Où part l’argent</h2>
                      <p className="mt-1 text-xs text-[#7b857f]">Année {snapshot.academicYear.label}</p>
                    </div>
                    <button type="button" onClick={() => setTransactionFilter("all")} className="text-xs font-semibold text-[#4e7340] hover:underline">Tout voir</button>
                  </div>

                  {snapshot.categories.length ? (
                    <>
                      <div className="relative mt-2 h-[210px]">
                        <MeasuredChart height={210} fallbackWidth={260}>
                          {(width) => <PieChart width={width} height={210}>
                            <Pie data={snapshot.categories} dataKey="amountFen" nameKey="label" innerRadius={57} outerRadius={88} paddingAngle={2} stroke="none">
                              {snapshot.categories.map((item) => <Cell key={item.category} fill={item.color} />)}
                            </Pie>
                            <Tooltip formatter={(value) => formatAmount(Number(value), true)} contentStyle={{ borderRadius: 12, borderColor: "#e3e2da", fontSize: 12 }} />
                          </PieChart>}
                        </MeasuredChart>
                        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#89918c]">Total</p>
                            <p className="mt-1 text-lg font-semibold tracking-[-0.04em] tabular-nums">{formatAmount(snapshot.spentFen, true)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {snapshot.categories.map((item) => {
                          const CategoryIcon = categoryIcons[item.category];
                          const active = transactionFilter === item.category;
                          return (
                            <button
                              type="button"
                              key={item.category}
                              onClick={() => setTransactionFilter(active ? "all" : item.category)}
                              className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[#f0efe8]", active && "bg-[#edf5dd]")}
                            >
                              <span className="grid size-7 place-items-center rounded-lg" style={{ backgroundColor: `${item.color}22`, color: item.color }}><CategoryIcon className="size-3.5" /></span>
                              <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.label}</span>
                              <span className="text-xs font-semibold tabular-nums">{formatAmount(item.amountFen, true)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : <EmptyState title="Aucune catégorie" description="Importe quelques opérations pour voir la répartition." />}
                </div>

                <div id="recent-transactions" className="min-w-0 scroll-mt-24 overflow-hidden rounded-[24px] border border-white bg-[#fbfaf5] shadow-[0_12px_40px_rgba(50,55,44,0.045)]">
                  <div className="flex flex-col gap-3 border-b border-[#e9e6de] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.035em]">Transactions récentes</h2>
                      <p className="mt-1 text-xs text-[#7b857f]">
                        {transactionFilter === "all" ? "Toutes les catégories" : categoryLabels[transactionFilter]}
                      </p>
                    </div>
                    <label className="flex h-9 items-center gap-2 rounded-xl bg-[#efeee7] px-3 text-[#728078] focus-within:ring-2 focus-within:ring-[#94bc67]/40">
                      <Search className="size-3.5" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Rechercher"
                        aria-label="Rechercher une transaction"
                        className="w-32 bg-transparent text-xs text-[#17352e] outline-none placeholder:text-[#8c948f]"
                      />
                    </label>
                  </div>

                  <div className="divide-y divide-[#ece9e1]">
                    {displayedTransactions.length ? displayedTransactions.slice(0, showAllTransactions ? undefined : 7).map((transaction) => (
                      <TransactionRow
                        key={transaction.id}
                        transaction={transaction}
                        onShare={() => {
                          setSelectedTransaction(transaction);
                          setDialog("share");
                        }}
                      />
                    )) : <EmptyState title="Aucun résultat" description="Essaie une autre recherche ou enlève le filtre." />}
                  </div>
                  {displayedTransactions.length > 7 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllTransactions((current) => !current)}
                      aria-expanded={showAllTransactions}
                      className="flex w-full items-center justify-center gap-1 border-t border-[#e9e6de] px-5 py-4 text-xs font-semibold text-[#4e7340] hover:bg-[#f6f5ef]"
                    >
                      {showAllTransactions ? "Réduire la liste" : `Voir les ${displayedTransactions.length} opérations`}
                      <ChevronRight className={cn("size-3.5 transition", showAllTransactions && "rotate-90")} />
                    </button>
                  ) : null}
                </div>
              </section>
            </div>

            <aside className="space-y-5" aria-label="Informations complémentaires">
              {snapshot.scope === "group" ? (
                <section className="rounded-[24px] border border-white bg-[#fbfaf5] p-5 shadow-[0_12px_40px_rgba(50,55,44,0.045)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a928d]">Soldes du groupe</p>
                      <h2 className="mt-1 text-lg font-semibold tracking-[-0.035em]">Qui doit quoi</h2>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" className="rounded-lg" onClick={() => setDialog("member")} aria-label="Inviter un membre"><UserPlus /></Button>
                  </div>
                  <div className="mt-5 space-y-2">
                    {snapshot.balances.length ? snapshot.balances.map((member) => {
                      const canSettle = !member.isCurrentUser && member.balanceFen !== 0 && currentUserBalanceFen !== 0 && Math.sign(member.balanceFen) !== Math.sign(currentUserBalanceFen);
                      return (
                      <button
                        type="button"
                        key={member.id}
                        onClick={() => {
                          if (!canSettle) return;
                          setSelectedBalance(member);
                          setDialog("settlement");
                        }}
                        disabled={!canSettle}
                        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition enabled:hover:bg-[#f0efe8] disabled:cursor-default"
                      >
                        <Avatar className="size-9 border-2 border-white shadow-sm">
                          {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
                          <AvatarFallback className="bg-[#e6ecdf] text-xs font-semibold text-[#45624e]">{initials(member.name)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{member.name}</span>
                          <span className="mt-0.5 block text-[10px] text-[#87908b]">{member.isCurrentUser ? "Moi" : member.balanceFen === 0 ? "À jour" : canSettle ? "Cliquer pour régler" : "Solde net"}</span>
                        </span>
                        <span className={cn("text-sm font-semibold tabular-nums", member.balanceFen > 0 ? "text-[#3c7d42]" : member.balanceFen < 0 ? "text-[#bd633e]" : "text-[#87908b]")}>
                          {member.balanceFen > 0 ? "+" : ""}{formatAmount(member.balanceFen, true)}
                        </span>
                      </button>
                      );
                    }) : <EmptyState title="Tous à zéro" description="Les prochains soldes apparaîtront ici." compact />}
                  </div>
                  <Button type="button" variant="outline" onClick={() => setDialog("member")} className="mt-5 h-10 w-full rounded-xl border-dashed bg-transparent text-xs">
                    <UserPlus /> Inviter un ami
                  </Button>
                </section>
              ) : (
                <section className="rounded-[24px] bg-[#e7efd8] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#65745e]">Vue groupe</p>
                  <h2 className="mt-2 text-lg font-semibold tracking-[-0.035em]">Les comptes restent séparés</h2>
                  <p className="mt-2 text-xs leading-5 text-[#667368]">Tes imports sont privés. Seules les dépenses que tu choisis de partager deviennent visibles.</p>
                  <Button type="button" onClick={() => switchScope("group")} className="mt-4 h-10 rounded-xl bg-[#173f35] text-xs text-white hover:bg-[#245848]"><Users /> Ouvrir le tricount</Button>
                </section>
              )}

              <section className="rounded-[24px] border border-white bg-[#fbfaf5] p-5 shadow-[0_12px_40px_rgba(50,55,44,0.045)]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a928d]">Budget consommé</p>
                  <button type="button" onClick={() => setDialog("budget")} className="text-[#738078] hover:text-[#173f35]" aria-label="Modifier le budget"><Ellipsis className="size-4" /></button>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <p className="text-3xl font-semibold tracking-[-0.055em] tabular-nums">{snapshot.budgetFen > 0 ? `${Math.round(budgetRatio * 100)} %` : "—"}</p>
                  <p className="pb-1 text-xs text-[#7b857f]">{snapshot.budgetFen > 0 ? `sur ${formatAmount(snapshot.budgetFen, true)}` : "Budget à définir"}</p>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e6e7df]">
                  <div className={cn("h-full rounded-full", budgetRatio > 1 ? "bg-[#e07850]" : "bg-[#8fcf52]")} style={{ width: `${Math.min(100, budgetRatio * 100)}%` }} />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#6f7c75]">
                  {snapshot.budgetFen <= 0
                    ? "Ajoute un budget pour suivre ton rythme sur toute l’année."
                    : budgetRatio <= 1
                      ? `${formatAmount(remainingFen, true)} disponibles jusqu’au ${formatDayMonth(snapshot.academicYear.endsOn)}.`
                      : `Budget dépassé de ${formatAmount(snapshot.spentFen - snapshot.budgetFen, true)}.`}
                </p>
              </section>

              <section className="overflow-hidden rounded-[24px] bg-[#f0dfcd] p-5">
                <div className="flex items-start justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#173f35] text-white"><Landmark className="size-5" /></span>
                  <Badge className="border-0 bg-white/55 text-[#6f5948]">{snapshot.topMerchant?.visits ?? 0} fois</Badge>
                </div>
                <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.16em] text-[#826b58]">Marchand n°1</p>
                <h2 className="mt-2 truncate text-xl font-semibold tracking-[-0.04em]">{snapshot.topMerchant?.name ?? "Pas encore de données"}</h2>
                <p className="mt-1 text-sm font-semibold tabular-nums text-[#7b5c45]">{snapshot.topMerchant ? formatAmount(snapshot.topMerchant.amountFen, true) : "—"}</p>
                <div className="mt-5 flex items-center justify-between border-t border-[#d9c4af] pt-4 text-xs text-[#735f4f]">
                  <span>Jour le plus dépensier</span>
                  <strong>{snapshot.busiestDay?.label ?? "—"}</strong>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>

      {notice ? (
        <div role="status" className="fixed right-4 bottom-4 z-[70] flex max-w-sm items-center gap-3 rounded-2xl bg-[#173f35] px-4 py-3 text-sm text-white shadow-2xl sm:right-6 sm:bottom-6">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#c9ff63] text-[#173f35]"><Check className="size-3.5" /></span>
          <p className="leading-5">{notice}</p>
          {invitationLink ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(invitationLink)
                  .then(() => {
                    setInvitationLink(null);
                    showNotice(invitationLink.includes("\n") ? "Liens d’invitation copiés." : "Lien d’invitation copié.");
                  })
                  .catch(() => {
                    setInvitationLink(null);
                    showNotice("Copie indisponible dans ce navigateur.");
                  });
              }}
              className="shrink-0 rounded-lg bg-[#c9ff63] px-2.5 py-1.5 text-xs font-semibold text-[#173f35] hover:bg-[#b8ef55]"
            >
              {invitationLink.includes("\n") ? "Copier les liens" : "Copier le lien"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              noticeSequenceRef.current += 1;
              setNotice(null);
              setInvitationLink(null);
            }}
            className="ml-1 text-white/55 hover:text-white"
            aria-label="Fermer"
          ><X className="size-4" /></button>
        </div>
      ) : null}

      {dialog === "expense" ? <AddExpenseDialog
        open
        onOpenChange={(open) => setDialog(open ? "expense" : null)}
        groups={snapshot.scope === "group" && selectedGroup ? [selectedGroup] : []}
        selectedGroupId={snapshot.scope === "group" ? snapshot.selectedGroupId : undefined}
        members={snapshot.scope === "group" ? snapshot.balances : []}
        startsOn={snapshot.academicYear.startsOn}
        endsOn={snapshot.academicYear.endsOn}
        onCreate={addExpense}
      /> : null}
      {dialog === "group" ? <CreateGroupDialog open onOpenChange={(open) => setDialog(open ? "group" : null)} onCreate={createGroup} /> : null}
      {dialog === "import" ? <ImportWalletDialog
        open
        onOpenChange={(open) => setDialog(open ? "import" : null)}
        initialSource={importSource}
        onPreview={async (source, file) => {
          if (demoMode) {
            const accepted = Math.max(8, Math.min(640, Math.round(file.size / 180)));
            return { importId: `demo-${source}-${Date.now()}`, accepted, duplicates: Math.round(accepted * 0.07), rejected: Math.round(accepted * 0.01), totalFen: accepted * 3_480 };
          }
          const form = new FormData();
          form.set("source", source);
          form.set("file", file);
          return readJson<{ importId: string; accepted: number; duplicates: number; rejected: number; totalFen: number }>(await fetch("/api/imports/preview", { method: "POST", body: form }));
        }}
        onConfirm={async (preview) => {
          if (demoMode) {
            setSnapshot((current) => ({
              ...current,
              imports: current.imports.map((item) => item.source === importSource ? { ...item, transactionCount: item.transactionCount + preview.accepted, lastImportedAt: new Date().toISOString() } : item),
              revision: current.revision + 1,
            }));
            showNotice(`${preview.accepted} transactions importées.`);
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
            const payload = await readJson<{ message?: string }>(response);
            mutationKeysRef.current.delete(mutationIdentity);
            await refreshSnapshot(snapshot.scope, snapshot.selectedGroupId);
            showNotice(payload.message ?? `${preview.accepted} transactions importées.`);
          } catch (error) {
            setSyncState("offline");
            throw error;
          }
        }}
      /> : null}
      {dialog === "member" ? <AddMemberDialog open onOpenChange={(open) => setDialog(open ? "member" : null)} groupName={selectedGroup?.name ?? "ce tricount"} onInvite={inviteMember} /> : null}
      {dialog === "budget" ? <BudgetDialog open onOpenChange={(open) => setDialog(open ? "budget" : null)} currentBudgetFen={snapshot.budgetFen} onSave={updateBudget} /> : null}
      {dialog === "settlement" ? <SettlementDialog open onOpenChange={(open) => setDialog(open ? "settlement" : null)} member={selectedBalance} currentUserBalanceFen={currentUserBalanceFen} onSettle={settleBalance} /> : null}
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
            if (!selectedTransaction) throw new Error("Opération introuvable.");
            await shareTransaction(selectedTransaction, groupId);
          }}
        />
      ) : null}
    </div>
  );
}

function DashboardSidebar({
  groups,
  insight,
  selectedGroupId,
  scope,
  open,
  onClose,
  onCreateGroup,
  onSelectGroup,
  onSelectPersonal,
  onOpenWallet,
  onOpenImports,
}: {
  readonly groups: readonly DashboardGroup[];
  readonly insight: DashboardSnapshot["busiestDay"];
  readonly selectedGroupId?: string;
  readonly scope: DashboardScope;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreateGroup: () => void;
  readonly onSelectGroup: (group: DashboardGroup) => void;
  readonly onSelectPersonal: () => void;
  readonly onOpenWallet: () => void;
  readonly onOpenImports: () => void;
}) {
  return (
    <>
      {open ? <button type="button" aria-label="Fermer la navigation" className="fixed inset-0 z-40 bg-[#102c25]/38 backdrop-blur-sm lg:hidden" onClick={onClose} /> : null}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[224px] flex-col border-r border-[#e5e2d9] bg-[#eeede5] px-4 py-5 transition-transform duration-300 lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <Image src="/assets/fen-logo-mark-v2.png" alt="" width={40} height={40} className="size-10 rounded-[12px] object-cover shadow-[0_8px_20px_rgba(23,63,53,0.15)]" priority />
            <div>
              <p className="text-lg font-semibold leading-none tracking-[-0.05em]">Fēn</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.17em] text-[#87908b]">China money year</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} className="rounded-lg lg:hidden" aria-label="Fermer"><X /></Button>
        </div>

        <nav className="mt-8" aria-label="Navigation principale">
          <button
            type="button"
            onClick={onSelectPersonal}
            className={cn(
              "flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left text-sm font-semibold transition",
              scope === "personal" ? "bg-[#173f35] text-white shadow-[0_10px_24px_rgba(23,63,53,0.14)]" : "text-[#68756e] hover:bg-white/60 hover:text-[#17352e]",
            )}
          >
            <Home className="size-4" /> Mon année
          </button>
          <button type="button" onClick={onOpenWallet} className="mt-1 flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left text-sm font-medium text-[#68756e] transition hover:bg-white/60 hover:text-[#17352e]">
            <WalletCards className="size-4" /> Mon portefeuille
          </button>
          <button type="button" onClick={onOpenImports} className="mt-1 flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left text-sm font-medium text-[#68756e] transition hover:bg-white/60 hover:text-[#17352e]">
            <BookOpen className="size-4" /> Tous les imports
          </button>
        </nav>

        <div className="mt-8 flex items-center justify-between px-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#8a928d]">Mes tricounts</p>
          <button type="button" onClick={onCreateGroup} className="grid size-7 place-items-center rounded-lg text-[#66756e] transition hover:bg-white hover:text-[#17352e]" aria-label="Créer un tricount"><Plus className="size-4" /></button>
        </div>

        <div className="mt-2 space-y-1.5">
          {groups.map((group) => {
            const active = scope === "group" && group.id === selectedGroupId;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => onSelectGroup(group)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[15px] px-2.5 py-2.5 text-left transition",
                  active ? "bg-white shadow-[0_8px_25px_rgba(44,54,45,0.07)]" : "hover:bg-white/55",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#173f35] text-white"><Users className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{group.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-[#89918c]">{group.city} · {group.memberCount} pers.</span>
                </span>
                {active ? <span className="size-2 rounded-full" style={{ backgroundColor: group.accent }} /> : null}
              </button>
            );
          })}
        </div>

        <button type="button" onClick={onCreateGroup} className="mt-3 flex w-full items-center gap-2 rounded-[14px] border border-dashed border-[#c8c8c0] px-3 py-3 text-xs font-semibold text-[#728078] transition hover:border-[#8fb466] hover:bg-white/55 hover:text-[#17352e]">
          <Plus className="size-4" /> Nouveau tricount
        </button>

        <div className="mt-auto rounded-[18px] bg-[#dde8cf] p-4">
          <div className="flex items-center gap-2 text-[#41633f]"><Sparkles className="size-4" /><span className="text-xs font-semibold">Conseil du mois</span></div>
          <p className="mt-2 text-[11px] leading-5 text-[#647462]">
            {insight
              ? `${insight.label} est ton jour le plus dépensier avec ${formatAmount(insight.amountFen, true)} sur la période.`
              : "Importe tes paiements pour faire ressortir les habitudes les plus utiles à suivre."}
          </p>
        </div>
      </aside>
    </>
  );
}

function ImportButton({ source, onClick }: { readonly source: "wechat" | "alipay"; readonly onClick: () => void }) {
  const isWechat = source === "wechat";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5",
        isWechat ? "bg-[#07c160]" : "bg-[#1677ff]",
      )}
      aria-label={`Importer depuis ${isWechat ? "WeChat Pay" : "Alipay"}`}
    >
      {isWechat ? <SiWechat size={18} /> : <SiAlipay size={19} />}
      {isWechat ? "WeChat Pay" : "Alipay"}
    </button>
  );
}

function TransactionRow({ transaction, onShare }: { readonly transaction: DashboardTransaction; readonly onShare: () => void }) {
  const CategoryIcon = categoryIcons[transaction.category];
  return (
    <article className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eeefe7] text-[#526b5b]"><CategoryIcon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{transaction.title}</h3>
          <span className={cn("shrink-0", transaction.source === "wechat" ? "text-[#07a953]" : transaction.source === "alipay" ? "text-[#1677ff]" : "text-[#76817b]")}>{sourceIcon(transaction.source, "size-3")}</span>
        </div>
        <p className="mt-1 truncate text-[10px] text-[#87908b]">{transaction.merchant} · {formatDate(transaction.occurredAt)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">−{formatAmount(transaction.amountFen, true)}</p>
        {transaction.shared ? (
          <p className="mt-1 text-[10px] font-semibold text-[#568147]">Partagée</p>
        ) : transaction.source !== "manual" ? (
          <button type="button" onClick={onShare} className="mt-1 text-[10px] font-semibold text-[#6a766f] underline decoration-[#aeb6b1] underline-offset-2 hover:text-[#3e6743]">Partager</button>
        ) : <p className="mt-1 text-[10px] text-[#87908b]">Privée</p>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" className="hidden rounded-lg sm:inline-flex" aria-label={`Actions pour ${transaction.title}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl border-[#deddd5] bg-[#fbfaf5] p-2">
          {!transaction.shared && transaction.source !== "manual" ? <DropdownMenuItem className="rounded-lg" onSelect={onShare}><Users /> Partager dans le tricount</DropdownMenuItem> : null}
          <DropdownMenuItem className="rounded-lg" disabled><PencilLine /> Catégorie modifiable bientôt</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

function SyncStateBadge({ state, onRefresh }: { readonly state: "synced" | "syncing" | "offline"; readonly onRefresh: () => void }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      className={cn(
        "hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold md:flex",
        state === "offline" ? "bg-[#fff0e8] text-[#a05233]" : "text-[#718078] hover:bg-white/60",
      )}
      aria-label="Actualiser les données"
    >
      {state === "offline" ? <CloudOff className="size-3.5" /> : state === "syncing" ? <RefreshCw className="size-3.5 animate-spin" /> : <span className="size-1.5 rounded-full bg-[#7dbf52]" />}
      {state === "offline" ? "Hors ligne" : state === "syncing" ? "Synchro…" : "Synchronisé"}
    </button>
  );
}

function EmptyState({ title, description, compact = false }: { readonly title: string; readonly description: string; readonly compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-5 text-center", compact ? "py-8" : "py-16")}>
      <span className="grid size-9 place-items-center rounded-xl bg-[#eceee7] text-[#708078]"><FileUp className="size-4" /></span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-[#87908b]">{description}</p>
    </div>
  );
}

function MeasuredChart({
  height,
  fallbackWidth,
  children,
}: {
  readonly height: number;
  readonly fallbackWidth: number;
  readonly children: (width: number) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallbackWidth);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (node) setWidth(Math.max(1, Math.round(node.getBoundingClientRect().width)));
  }, []);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setWidth(Math.max(1, Math.round(containerRef.current.getBoundingClientRect().width)));
      }
    };
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return <div ref={measureRef} style={{ height }}>{children(width)}</div>;
}
