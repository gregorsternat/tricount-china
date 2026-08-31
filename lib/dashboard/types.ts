export type DashboardScope = "personal" | "group";

export type TransactionSource = "wechat" | "alipay" | "manual";

export type TransactionCategory =
  | "food"
  | "transport"
  | "housing"
  | "shopping"
  | "leisure"
  | "travel"
  | "health"
  | "other";

export interface DashboardUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly avatarUrl?: string;
}

export interface DashboardGroup {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly memberCount: number;
  readonly spentFen: number;
  readonly accent: string;
}

export interface MonthlySpend {
  readonly key: string;
  readonly label: string;
  readonly spentFen: number;
  readonly budgetFen: number;
  readonly observed: boolean;
}

export interface CategorySpend {
  readonly category: TransactionCategory;
  readonly label: string;
  readonly amountFen: number;
  readonly color: string;
}

export interface DashboardTransaction {
  readonly id: string;
  readonly title: string;
  readonly merchant: string;
  readonly occurredAt: string;
  readonly amountFen: number;
  readonly category: TransactionCategory;
  readonly source: TransactionSource;
  readonly paidBy: string;
  readonly groupId?: string;
  readonly shared: boolean;
  readonly note?: string;
}

export interface MemberBalance {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly isCurrentUser?: boolean;
  /** Positive means the group owes this member; negative means they owe. */
  readonly balanceFen: number;
}

export interface ImportAccountStatus {
  readonly source: Exclude<TransactionSource, "manual">;
  readonly transactionCount: number;
  readonly lastImportedAt?: string;
}

export interface DashboardSnapshot {
  readonly viewer: DashboardUser;
  readonly scope: DashboardScope;
  readonly groups: readonly DashboardGroup[];
  readonly selectedGroupId?: string;
  readonly academicYear: {
    readonly label: string;
    readonly startsOn: string;
    readonly endsOn: string;
  };
  readonly spentFen: number;
  readonly budgetFen: number;
  /** Null until a complete comparable prior period is available. */
  readonly previousPeriodDelta: number | null;
  readonly monthly: readonly MonthlySpend[];
  readonly categories: readonly CategorySpend[];
  readonly transactions: readonly DashboardTransaction[];
  readonly balances: readonly MemberBalance[];
  readonly imports: readonly ImportAccountStatus[];
  readonly topMerchant: {
    readonly name: string;
    readonly amountFen: number;
    readonly visits: number;
  } | null;
  readonly busiestDay: {
    readonly label: string;
    readonly amountFen: number;
  } | null;
  readonly generatedAt: string;
  readonly revision: number;
}

export interface DashboardMutationResult {
  readonly ok: boolean;
  readonly revision?: number;
  readonly message?: string;
}
