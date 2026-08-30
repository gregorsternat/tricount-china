"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  EXPENSE_CATEGORIES,
  DEMO_GROUP_ID,
  createDemoGroups,
  type ExpenseDraft,
  type LedgerExpense,
  type LedgerGroup,
  type LedgerParticipant,
  type LedgerSettlement,
} from "@/lib/demo-data";
import { validateExactShares } from "@/lib/domain";

export type {
  CreateGroupInput,
  ExpenseCategory,
  ExpenseDraft,
  LedgerExpense,
  LedgerGroup,
  LedgerParticipant,
  LedgerSettlement,
} from "@/lib/demo-data";

export const LEDGER_STORAGE_VERSION = 1 as const;
export const LEDGER_STORAGE_KEY = "fen-ledger:ledger-store";

const GROUP_EMOJIS = ["🧾", "🏙️", "🏖️", "🏠", "🍜", "🚄"] as const;
const CATEGORY_SET = new Set<string>(EXPENSE_CATEGORIES);

export interface SettlementDraft {
  readonly fromParticipantId: string;
  readonly toParticipantId: string;
  readonly amountFen: number;
  readonly settledAt?: string;
}

export interface LedgerStoreContextValue {
  readonly groups: readonly LedgerGroup[];
  readonly selectedGroupId: string | null;
  readonly selectedGroup: LedgerGroup | null;
  readonly isHydrated: boolean;
  readonly selectGroup: (groupId: string) => void;
  readonly createGroup: (
    name: string,
    participantNames: readonly string[],
  ) => string;
  readonly renameGroup: (groupId: string, name: string) => void;
  readonly addParticipant: (groupId: string, name: string) => string;
  readonly addExpense: (groupId: string, draft: ExpenseDraft) => string;
  readonly updateExpense: (
    groupId: string,
    expenseId: string,
    draft: ExpenseDraft,
  ) => void;
  readonly deleteExpense: (groupId: string, expenseId: string) => void;
  readonly restoreExpense: (groupId: string, expenseId: string) => void;
  readonly addSettlement: (groupId: string, draft: SettlementDraft) => string;
  readonly deleteSettlement: (groupId: string, settlementId: string) => void;
  readonly deleteGroup: (groupId: string) => void;
  readonly resetDemo: () => void;
}

interface LedgerState {
  readonly groups: readonly LedgerGroup[];
  readonly selectedGroupId: string | null;
  readonly isHydrated: boolean;
}

interface PersistedLedgerState {
  readonly version: typeof LEDGER_STORAGE_VERSION;
  readonly groups: readonly LedgerGroup[];
  readonly selectedGroupId: string | null;
}

export class LedgerStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerStoreError";
  }
}

const LedgerStoreContext = createContext<LedgerStoreContextValue | null>(null);

function createInitialState(isHydrated: boolean): LedgerState {
  return {
    groups: createDemoGroups(),
    selectedGroupId: DEMO_GROUP_ID,
    isHydrated,
  };
}

function createId(): string {
  return globalThis.crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRequiredText(value: string, label: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new LedgerStoreError(`${label} ne peut pas être vide.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function assertIsoDate(value: string, label: string): void {
  if (value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new LedgerStoreError(`${label} doit être une date valide.`);
  }
}

function assertPositiveFen(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new LedgerStoreError(`${label} doit être un entier positif en fen.`);
  }
}

function normalizeParticipantNames(
  participantNames: readonly string[],
): string[] {
  if (participantNames.length === 0) {
    throw new LedgerStoreError("Un groupe doit contenir au moins une personne.");
  }

  const normalizedNames = participantNames.map((name, index) =>
    normalizeRequiredText(name, `Le participant ${index + 1}`),
  );
  const uniqueNames = new Set(
    normalizedNames.map((name) => name.toLocaleLowerCase()),
  );

  if (uniqueNames.size !== normalizedNames.length) {
    throw new LedgerStoreError("Les noms des participants doivent être uniques.");
  }

  return normalizedNames;
}

function normalizeExpenseDraft(draft: ExpenseDraft): ExpenseDraft {
  assertPositiveFen(draft.amountFen, "Le montant");
  assertIsoDate(draft.occurredAt, "La date de dépense");

  if (!CATEGORY_SET.has(draft.category)) {
    throw new LedgerStoreError("La catégorie de dépense est inconnue.");
  }

  try {
    validateExactShares(draft.amountFen, draft.shares);
  } catch (error) {
    throw new LedgerStoreError(
      error instanceof Error
        ? error.message
        : "La répartition de la dépense est invalide.",
    );
  }

  return {
    title: normalizeRequiredText(draft.title, "Le libellé"),
    amountFen: draft.amountFen,
    payerId: draft.payerId,
    shares: draft.shares.map((share) => ({ ...share })),
    category: draft.category,
    note: normalizeOptionalText(draft.note),
    occurredAt: draft.occurredAt,
  };
}

function getGroupOrThrow(
  groups: readonly LedgerGroup[],
  groupId: string,
): LedgerGroup {
  const group = groups.find((candidate) => candidate.id === groupId);

  if (!group) {
    throw new LedgerStoreError(`Groupe introuvable : ${groupId}`);
  }

  return group;
}

function getExpenseOrThrow(
  group: LedgerGroup,
  expenseId: string,
): LedgerExpense {
  const expense = group.expenses.find((candidate) => candidate.id === expenseId);

  if (!expense) {
    throw new LedgerStoreError(`Dépense introuvable : ${expenseId}`);
  }

  return expense;
}

function assertExpenseParticipants(
  group: LedgerGroup,
  draft: ExpenseDraft,
): void {
  const participantIds = new Set(
    group.participants.map((participant) => participant.id),
  );

  if (!participantIds.has(draft.payerId)) {
    throw new LedgerStoreError("Le payeur ne fait pas partie du groupe.");
  }

  for (const share of draft.shares) {
    if (!participantIds.has(share.participantId)) {
      throw new LedgerStoreError(
        "Une part de dépense référence une personne inconnue.",
      );
    }
  }
}

function replaceGroup(
  groups: readonly LedgerGroup[],
  groupId: string,
  update: (group: LedgerGroup) => LedgerGroup,
): readonly LedgerGroup[] {
  let found = false;
  const nextGroups = groups.map((group) => {
    if (group.id !== groupId) return group;
    found = true;
    return update(group);
  });

  if (!found) {
    throw new LedgerStoreError(`Groupe introuvable : ${groupId}`);
  }

  return nextGroups;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isFen(value: unknown, allowZero = true): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    (allowZero ? value >= 0 : value > 0)
  );
}

function isLedgerParticipant(value: unknown): value is LedgerParticipant {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    value.id === value.id.trim() &&
    isNonEmptyString(value.name) &&
    (value.archivedAt === undefined || isIsoDate(value.archivedAt))
  );
}

function isLedgerExpense(
  value: unknown,
  groupId: string,
  participantIds: ReadonlySet<string>,
): value is LedgerExpense {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    value.groupId !== groupId ||
    !isNonEmptyString(value.title) ||
    !isFen(value.amountFen, false) ||
    !isNonEmptyString(value.payerId) ||
    !participantIds.has(value.payerId) ||
    !Array.isArray(value.shares) ||
    !CATEGORY_SET.has(String(value.category)) ||
    !isIsoDate(value.occurredAt) ||
    !isIsoDate(value.createdAt) ||
    (value.note !== undefined && typeof value.note !== "string") ||
    (value.deletedAt !== undefined && !isIsoDate(value.deletedAt))
  ) {
    return false;
  }

  const seenParticipants = new Set<string>();
  let totalFen = 0;

  for (const share of value.shares) {
    if (
      !isRecord(share) ||
      !isNonEmptyString(share.participantId) ||
      !participantIds.has(share.participantId) ||
      seenParticipants.has(share.participantId) ||
      !isFen(share.amountFen)
    ) {
      return false;
    }

    seenParticipants.add(share.participantId);
    totalFen += share.amountFen;

    if (!Number.isSafeInteger(totalFen)) return false;
  }

  return value.shares.length > 0 && totalFen === value.amountFen;
}

function isLedgerSettlement(
  value: unknown,
  groupId: string,
  participantIds: ReadonlySet<string>,
): value is LedgerSettlement {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    value.groupId === groupId &&
    isNonEmptyString(value.fromParticipantId) &&
    isNonEmptyString(value.toParticipantId) &&
    value.fromParticipantId !== value.toParticipantId &&
    participantIds.has(value.fromParticipantId) &&
    participantIds.has(value.toParticipantId) &&
    isFen(value.amountFen, false) &&
    isIsoDate(value.settledAt) &&
    isIsoDate(value.createdAt)
  );
}

function isLedgerGroup(value: unknown): value is LedgerGroup {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.emoji) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt) ||
    !isNonEmptyString(value.currentParticipantId) ||
    !Array.isArray(value.participants) ||
    !Array.isArray(value.expenses) ||
    !Array.isArray(value.settlements)
  ) {
    return false;
  }

  if (!value.participants.every(isLedgerParticipant)) return false;

  const groupId = value.id;
  const participantIds = new Set(
    value.participants.map((participant) => participant.id),
  );

  if (
    participantIds.size !== value.participants.length ||
    !participantIds.has(value.currentParticipantId)
  ) {
    return false;
  }

  if (
    !value.expenses.every((expense) =>
      isLedgerExpense(expense, groupId, participantIds),
    ) ||
    !value.settlements.every((settlement) =>
      isLedgerSettlement(settlement, groupId, participantIds),
    )
  ) {
    return false;
  }

  const expenseIds = new Set(value.expenses.map((expense) => expense.id));
  const settlementIds = new Set(
    value.settlements.map((settlement) => settlement.id),
  );

  return (
    expenseIds.size === value.expenses.length &&
    settlementIds.size === value.settlements.length
  );
}

function parsePersistedState(rawValue: string): PersistedLedgerState | null {
  try {
    const value: unknown = JSON.parse(rawValue);

    if (
      !isRecord(value) ||
      value.version !== LEDGER_STORAGE_VERSION ||
      !Array.isArray(value.groups) ||
      !value.groups.every(isLedgerGroup) ||
      (value.selectedGroupId !== null &&
        typeof value.selectedGroupId !== "string")
    ) {
      return null;
    }

    const groupIds = new Set(value.groups.map((group) => group.id));
    if (groupIds.size !== value.groups.length) return null;

    const selectedGroupId = groupIds.has(value.selectedGroupId as string)
      ? (value.selectedGroupId as string)
      : (value.groups[0]?.id ?? null);

    return {
      version: LEDGER_STORAGE_VERSION,
      groups: value.groups,
      selectedGroupId,
    };
  } catch {
    return null;
  }
}

export function getActiveExpenses(
  group: LedgerGroup,
): readonly LedgerExpense[] {
  return group.expenses.filter((expense) => expense.deletedAt === undefined);
}

export function LedgerStoreProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<LedgerState>(() => createInitialState(false));

  useEffect(() => {
    let persistedState: PersistedLedgerState | null = null;
    let cancelled = false;

    try {
      const rawValue = window.localStorage.getItem(LEDGER_STORAGE_KEY);
      persistedState = rawValue ? parsePersistedState(rawValue) : null;
    } catch {
      // localStorage can be unavailable in private or hardened browsing modes.
    }

    queueMicrotask(() => {
      if (cancelled) return;

      if (persistedState) {
        setState({
          groups: persistedState.groups,
          selectedGroupId: persistedState.selectedGroupId,
          isHydrated: true,
        });
        return;
      }

      setState((current) => ({ ...current, isHydrated: true }));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.isHydrated) return;

    const persistedState: PersistedLedgerState = {
      version: LEDGER_STORAGE_VERSION,
      groups: state.groups,
      selectedGroupId: state.selectedGroupId,
    };

    try {
      window.localStorage.setItem(
        LEDGER_STORAGE_KEY,
        JSON.stringify(persistedState),
      );
    } catch {
      // Keep the in-memory app usable when persistence is unavailable.
    }
  }, [state.groups, state.isHydrated, state.selectedGroupId]);

  const selectGroup = useCallback((groupId: string) => {
    setState((current) => {
      getGroupOrThrow(current.groups, groupId);
      return { ...current, selectedGroupId: groupId };
    });
  }, []);

  const createGroup = useCallback(
    (name: string, participantNames: readonly string[]): string => {
      const normalizedName = normalizeRequiredText(name, "Le nom du groupe");
      const normalizedParticipantNames = normalizeParticipantNames(participantNames);
      const groupId = createId();
      const participants = normalizedParticipantNames.map<LedgerParticipant>(
        (participantName) => ({
          id: createId(),
          name: participantName,
        }),
      );
      const timestamp = nowIso();

      const group: LedgerGroup = {
        id: groupId,
        name: normalizedName,
        emoji: GROUP_EMOJIS[0],
        createdAt: timestamp,
        updatedAt: timestamp,
        currentParticipantId: participants[0].id,
        participants,
        expenses: [],
        settlements: [],
      };

      setState((current) => ({
        ...current,
        groups: [...current.groups, group],
        selectedGroupId: groupId,
      }));

      return groupId;
    },
    [],
  );

  const renameGroup = useCallback((groupId: string, name: string) => {
    const normalizedName = normalizeRequiredText(name, "Le nom du groupe");
    const timestamp = nowIso();

    setState((current) => ({
      ...current,
      groups: replaceGroup(current.groups, groupId, (group) => ({
        ...group,
        name: normalizedName,
        updatedAt: timestamp,
      })),
    }));
  }, []);

  const addParticipant = useCallback((groupId: string, name: string): string => {
    const normalizedName = normalizeRequiredText(name, "Le nom du participant");
    const participantId = createId();
    const timestamp = nowIso();

    setState((current) => ({
      ...current,
      groups: replaceGroup(current.groups, groupId, (group) => {
        const duplicate = group.participants.some(
          (participant) =>
            participant.name.toLocaleLowerCase() ===
            normalizedName.toLocaleLowerCase(),
        );

        if (duplicate) {
          throw new LedgerStoreError("Ce participant existe déjà dans le groupe.");
        }

        return {
          ...group,
          participants: [
            ...group.participants,
            { id: participantId, name: normalizedName },
          ],
          updatedAt: timestamp,
        };
      }),
    }));

    return participantId;
  }, []);

  const addExpense = useCallback(
    (groupId: string, draft: ExpenseDraft): string => {
      const normalizedDraft = normalizeExpenseDraft(draft);
      const expenseId = createId();
      const timestamp = nowIso();

      setState((current) => ({
        ...current,
        groups: replaceGroup(current.groups, groupId, (group) => {
          assertExpenseParticipants(group, normalizedDraft);

          const expense: LedgerExpense = {
            id: expenseId,
            groupId,
            createdAt: timestamp,
            ...normalizedDraft,
          };

          return {
            ...group,
            expenses: [...group.expenses, expense],
            updatedAt: timestamp,
          };
        }),
      }));

      return expenseId;
    },
    [],
  );

  const updateExpense = useCallback(
    (groupId: string, expenseId: string, draft: ExpenseDraft) => {
      const normalizedDraft = normalizeExpenseDraft(draft);
      const timestamp = nowIso();

      setState((current) => ({
        ...current,
        groups: replaceGroup(current.groups, groupId, (group) => {
          const currentExpense = getExpenseOrThrow(group, expenseId);

          if (currentExpense.deletedAt) {
            throw new LedgerStoreError(
              "Restaurez la dépense avant de la modifier.",
            );
          }

          assertExpenseParticipants(group, normalizedDraft);

          return {
            ...group,
            expenses: group.expenses.map((expense) =>
              expense.id === expenseId
                ? {
                    ...expense,
                    ...normalizedDraft,
                    id: expense.id,
                    groupId: expense.groupId,
                    createdAt: expense.createdAt,
                  }
                : expense,
            ),
            updatedAt: timestamp,
          };
        }),
      }));
    },
    [],
  );

  const deleteExpense = useCallback((groupId: string, expenseId: string) => {
    const timestamp = nowIso();

    setState((current) => ({
      ...current,
      groups: replaceGroup(current.groups, groupId, (group) => {
        getExpenseOrThrow(group, expenseId);

        return {
          ...group,
          expenses: group.expenses.map((expense) =>
            expense.id === expenseId
              ? { ...expense, deletedAt: timestamp }
              : expense,
          ),
          updatedAt: timestamp,
        };
      }),
    }));
  }, []);

  const restoreExpense = useCallback((groupId: string, expenseId: string) => {
    const timestamp = nowIso();

    setState((current) => ({
      ...current,
      groups: replaceGroup(current.groups, groupId, (group) => {
        const expenseToRestore = getExpenseOrThrow(group, expenseId);

        if (!expenseToRestore.deletedAt) return group;

        return {
          ...group,
          expenses: group.expenses.map((expense) => {
            if (expense.id !== expenseId) return expense;
            return { ...expense, deletedAt: undefined };
          }),
          updatedAt: timestamp,
        };
      }),
    }));
  }, []);

  const addSettlement = useCallback(
    (groupId: string, draft: SettlementDraft): string => {
      assertPositiveFen(draft.amountFen, "Le remboursement");

      if (draft.fromParticipantId === draft.toParticipantId) {
        throw new LedgerStoreError(
          "Un remboursement doit être effectué entre deux personnes différentes.",
        );
      }

      const settledAt = draft.settledAt ?? nowIso();
      assertIsoDate(settledAt, "La date du remboursement");

      const settlementId = createId();
      const timestamp = nowIso();

      setState((current) => ({
        ...current,
        groups: replaceGroup(current.groups, groupId, (group) => {
          const participantIds = new Set(
            group.participants.map((participant) => participant.id),
          );

          if (
            !participantIds.has(draft.fromParticipantId) ||
            !participantIds.has(draft.toParticipantId)
          ) {
            throw new LedgerStoreError(
              "Le remboursement référence une personne inconnue.",
            );
          }

          const settlement: LedgerSettlement = {
            id: settlementId,
            groupId,
            fromParticipantId: draft.fromParticipantId,
            toParticipantId: draft.toParticipantId,
            amountFen: draft.amountFen,
            settledAt,
            createdAt: timestamp,
          };

          return {
            ...group,
            settlements: [...group.settlements, settlement],
            updatedAt: timestamp,
          };
        }),
      }));

      return settlementId;
    },
    [],
  );

  const deleteSettlement = useCallback(
    (groupId: string, settlementId: string) => {
      const timestamp = nowIso();

      setState((current) => ({
        ...current,
        groups: replaceGroup(current.groups, groupId, (group) => {
          if (
            !group.settlements.some(
              (settlement) => settlement.id === settlementId,
            )
          ) {
            throw new LedgerStoreError(
              `Remboursement introuvable : ${settlementId}`,
            );
          }

          return {
            ...group,
            settlements: group.settlements.filter(
              (settlement) => settlement.id !== settlementId,
            ),
            updatedAt: timestamp,
          };
        }),
      }));
    },
    [],
  );

  const deleteGroup = useCallback((groupId: string) => {
    setState((current) => {
      getGroupOrThrow(current.groups, groupId);
      const groups = current.groups.filter((group) => group.id !== groupId);

      return {
        ...current,
        groups,
        selectedGroupId:
          current.selectedGroupId === groupId
            ? (groups[0]?.id ?? null)
            : current.selectedGroupId,
      };
    });
  }, []);

  const resetDemo = useCallback(() => {
    setState(createInitialState(true));
  }, []);

  const selectedGroup = useMemo(
    () =>
      state.groups.find((group) => group.id === state.selectedGroupId) ?? null,
    [state.groups, state.selectedGroupId],
  );

  const value = useMemo<LedgerStoreContextValue>(
    () => ({
      groups: state.groups,
      selectedGroupId: state.selectedGroupId,
      selectedGroup,
      isHydrated: state.isHydrated,
      selectGroup,
      createGroup,
      renameGroup,
      addParticipant,
      addExpense,
      updateExpense,
      deleteExpense,
      restoreExpense,
      addSettlement,
      deleteSettlement,
      deleteGroup,
      resetDemo,
    }),
    [
      addExpense,
      addParticipant,
      addSettlement,
      createGroup,
      deleteExpense,
      deleteGroup,
      deleteSettlement,
      renameGroup,
      resetDemo,
      restoreExpense,
      selectGroup,
      selectedGroup,
      state.groups,
      state.isHydrated,
      state.selectedGroupId,
      updateExpense,
    ],
  );

  return (
    <LedgerStoreContext.Provider value={value}>
      {children}
    </LedgerStoreContext.Provider>
  );
}

export const LedgerProvider = LedgerStoreProvider;

export function useLedgerStore(): LedgerStoreContextValue {
  const context = useContext(LedgerStoreContext);

  if (!context) {
    throw new LedgerStoreError(
      "useLedgerStore doit être utilisé dans LedgerStoreProvider.",
    );
  }

  return context;
}

export const useLedger = useLedgerStore;

export function useSelectedLedgerGroup(): LedgerGroup | null {
  return useLedgerStore().selectedGroup;
}
