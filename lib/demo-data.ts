import {
  splitEvenly,
  type Expense,
  type Participant,
  type Settlement,
} from "@/lib/domain";

export const EXPENSE_CATEGORIES = [
  "food",
  "transport",
  "coffee",
  "visit",
  "shopping",
  "stay",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface LedgerExpense extends Omit<Expense, "occurredAt"> {
  readonly category: ExpenseCategory;
  readonly note?: string;
  readonly occurredAt: string;
  readonly createdAt: string;
  /** Soft deletion keeps the expense available to an undo toast. */
  readonly deletedAt?: string;
}

export type ExpenseDraft = Omit<
  LedgerExpense,
  "id" | "groupId" | "createdAt" | "deletedAt"
>;

export interface CreateGroupInput {
  readonly name: string;
  readonly participantNames: readonly string[];
}

export interface LedgerSettlement extends Omit<Settlement, "settledAt"> {
  readonly settledAt: string;
  readonly createdAt: string;
}

export interface LedgerParticipant extends Participant {
  readonly archivedAt?: string;
}

export interface LedgerGroup {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly currentParticipantId: string;
  readonly participants: readonly LedgerParticipant[];
  readonly expenses: readonly LedgerExpense[];
  readonly settlements: readonly LedgerSettlement[];
}

export const DEMO_GROUP_ID = "demo-shanghai-weekend";
export const DEMO_CURRENT_PARTICIPANT_ID = "demo-participant-gregor";

const PARTICIPANT_IDS = {
  gregor: DEMO_CURRENT_PARTICIPANT_ID,
  lea: "demo-participant-lea",
  yanis: "demo-participant-yanis",
  xiaoyu: "demo-participant-xiaoyu",
} as const;

function createExpense(
  id: string,
  createdAt: string,
  draft: ExpenseDraft,
): LedgerExpense {
  return {
    id,
    groupId: DEMO_GROUP_ID,
    createdAt,
    ...draft,
  };
}

/**
 * Returns fresh references while keeping the demo itself deterministic. This
 * avoids sharing mutable state between provider instances and test cases.
 */
export function createDemoGroups(): LedgerGroup[] {
  const participants: LedgerParticipant[] = [
    { id: PARTICIPANT_IDS.gregor, name: "Gregor" },
    { id: PARTICIPANT_IDS.lea, name: "Léa" },
    { id: PARTICIPANT_IDS.yanis, name: "Yanis" },
    { id: PARTICIPANT_IDS.xiaoyu, name: "小雨" },
  ];

  const allParticipantIds = participants.map((participant) => participant.id);

  const expenses: LedgerExpense[] = [
    createExpense(
      "demo-expense-didi-pudong",
      "2026-08-28T10:17:00+08:00",
      {
        title: "Didi depuis Pudong",
        amountFen: 18_640,
        payerId: PARTICIPANT_IDS.gregor,
        shares: splitEvenly(18_640, allParticipantIds),
        category: "transport",
        note: "Terminal 2 → Jing’an",
        occurredAt: "2026-08-28T09:42:00+08:00",
      },
    ),
    createExpense(
      "demo-expense-shengjian",
      "2026-08-28T12:29:00+08:00",
      {
        title: "Petit-déjeuner 生煎",
        amountFen: 10_400,
        payerId: PARTICIPANT_IDS.xiaoyu,
        shares: splitEvenly(10_400, allParticipantIds),
        category: "food",
        occurredAt: "2026-08-28T11:55:00+08:00",
      },
    ),
    createExpense(
      "demo-expense-shanghai-tower",
      "2026-08-28T16:06:00+08:00",
      {
        title: "Billets Shanghai Tower",
        amountFen: 72_000,
        payerId: PARTICIPANT_IDS.lea,
        shares: splitEvenly(72_000, allParticipantIds),
        category: "visit",
        occurredAt: "2026-08-28T15:48:00+08:00",
      },
    ),
    createExpense(
      "demo-expense-xiaolongbao",
      "2026-08-29T13:38:00+08:00",
      {
        title: "Déjeuner xiaolongbao",
        amountFen: 36_800,
        payerId: PARTICIPANT_IDS.yanis,
        shares: splitEvenly(36_800, allParticipantIds),
        category: "food",
        note: "南翔馒头店",
        occurredAt: "2026-08-29T13:04:00+08:00",
      },
    ),
    createExpense(
      "demo-expense-hotel-jingan",
      "2026-08-29T15:22:00+08:00",
      {
        title: "Hôtel à Jing’an",
        amountFen: 138_800,
        payerId: PARTICIPANT_IDS.gregor,
        shares: splitEvenly(138_800, allParticipantIds),
        category: "stay",
        note: "Deux chambres, une nuit",
        occurredAt: "2026-08-29T14:00:00+08:00",
      },
    ),
    createExpense(
      "demo-expense-metro-ferry",
      "2026-08-29T18:44:00+08:00",
      {
        title: "Métro et ferry",
        amountFen: 6_400,
        payerId: PARTICIPANT_IDS.xiaoyu,
        shares: splitEvenly(6_400, [
          PARTICIPANT_IDS.gregor,
          PARTICIPANT_IDS.lea,
          PARTICIPANT_IDS.xiaoyu,
        ]),
        category: "transport",
        occurredAt: "2026-08-29T18:20:00+08:00",
      },
    ),
    createExpense(
      "demo-expense-hotpot",
      "2026-08-29T22:13:00+08:00",
      {
        title: "Hotpot du samedi",
        amountFen: 59_600,
        payerId: PARTICIPANT_IDS.xiaoyu,
        shares: splitEvenly(59_600, allParticipantIds),
        category: "food",
        note: "锅底 inclus",
        occurredAt: "2026-08-29T21:35:00+08:00",
      },
    ),
    createExpense(
      "demo-expense-cafe",
      "2026-08-30T11:48:00+08:00",
      {
        title: "Café et pâtisseries",
        amountFen: 15_150,
        payerId: PARTICIPANT_IDS.lea,
        shares: splitEvenly(15_150, [
          PARTICIPANT_IDS.gregor,
          PARTICIPANT_IDS.lea,
          PARTICIPANT_IDS.yanis,
        ]),
        category: "coffee",
        occurredAt: "2026-08-30T11:26:00+08:00",
      },
    ),
  ];

  const settlements: LedgerSettlement[] = [
    {
      id: "demo-settlement-yanis-gregor",
      groupId: DEMO_GROUP_ID,
      fromParticipantId: PARTICIPANT_IDS.yanis,
      toParticipantId: PARTICIPANT_IDS.gregor,
      amountFen: 10_000,
      settledAt: "2026-08-30T20:12:00+08:00",
      createdAt: "2026-08-30T20:12:00+08:00",
    },
  ];

  return [
    {
      id: DEMO_GROUP_ID,
      name: "Week-end à Shanghai",
      emoji: "🏙️",
      createdAt: "2026-08-27T20:30:00+08:00",
      updatedAt: "2026-08-30T20:12:00+08:00",
      currentParticipantId: DEMO_CURRENT_PARTICIPANT_ID,
      participants,
      expenses,
      settlements,
    },
  ];
}

export const DEMO_GROUPS: readonly LedgerGroup[] = createDemoGroups();
