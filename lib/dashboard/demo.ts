import {
  currentMonthKey,
  dayCount,
  isoDate,
  monthKeysEndingAt,
  monthPeriod,
} from "@/lib/dashboard/period";
import type {
  CategorySpend,
  DashboardGroup,
  DashboardScope,
  DashboardSnapshot,
  DashboardTransaction,
  MemberBalance,
} from "@/lib/dashboard/types";

const groups: readonly DashboardGroup[] = [
  {
    id: "beijing-flat",
    name: "Beijing flat",
    city: "北京",
    memberCount: 4,
    spentFen: 421_800,
    accent: "#c9ff63",
  },
  {
    id: "weekend-trips",
    name: "Weekend trips",
    city: "中国",
    memberCount: 6,
    spentFen: 189_860,
    accent: "#ffb264",
  },
  {
    id: "mandarin-class",
    name: "Mandarin class",
    city: "北京",
    memberCount: 8,
    spentFen: 74_540,
    accent: "#8ed9cf",
  },
];

const personalCategoryAmounts: readonly CategorySpend[] = [
  { category: "restaurant", amountFen: 78_400 },
  { category: "groceries", amountFen: 64_000 },
  { category: "housing", amountFen: 60_000 },
  { category: "transport", amountFen: 28_000 },
  { category: "leisure", amountFen: 18_000 },
  { category: "shopping", amountFen: 16_000 },
  { category: "other", amountFen: 21_656 },
];

const groupCategoryAmounts: readonly CategorySpend[] = [
  { category: "housing", amountFen: 148_000 },
  { category: "restaurant", amountFen: 104_800 },
  { category: "groceries", amountFen: 82_000 },
  { category: "transport", amountFen: 37_000 },
  { category: "leisure", amountFen: 22_000 },
  { category: "other", amountFen: 28_000 },
];

const balances: readonly MemberBalance[] = [
  { id: "gregor", name: "Gregor", avatarUrl: "/assets/profile-avatar.png", isCurrentUser: true, balanceFen: 28_760 },
  { id: "lea", name: "Léa", balanceFen: 12_420 },
  { id: "yanis", name: "Yanis", balanceFen: -17_310 },
  { id: "xiaoyu", name: "小雨", balanceFen: -23_870 },
];

export function createDemoDashboard(
  scope: DashboardScope = "personal",
  month = currentMonthKey(),
  requestedGroupId?: string,
  now = new Date(),
): DashboardSnapshot {
  const isPersonal = scope === "personal";
  const period = monthPeriod(month);
  const categories = isPersonal ? personalCategoryAmounts : groupCategoryAmounts;
  const spentFen = categories.reduce((total, category) => total + category.amountFen, 0);
  const budgetFen = isPersonal ? 350_000 : 520_000;
  const trendMultipliers = [0.71, 0.83, 0.76, 0.92, 0.86, 1];
  const currentMonth = currentMonthKey(now);
  const trend = monthKeysEndingAt(month, 6).map((key, index) => ({
    key,
    spentFen: Math.round(spentFen * (trendMultipliers[index] ?? 1)),
    observed: key <= currentMonth,
  }));
  const observedDays = month < currentMonth
    ? dayCount(month)
    : month === currentMonth
      ? Number(isoDate(now).slice(-2))
      : 0;
  const dailyWeights = [0.08, 0.04, 0.12, 0.05, 0.07, 0.11, 0.04, 0.09, 0.06, 0.13, 0.08, 0.13];
  const daily = Array.from({ length: dayCount(month) }, (_, index) => {
    const day = index + 1;
    const weight = day <= observedDays ? (dailyWeights[index] ?? 0) : 0;
    return {
      key: `${month}-${String(day).padStart(2, "0")}`,
      day,
      spentFen: Math.round(spentFen * weight),
      observed: day <= observedDays,
    };
  });
  const dailyDifference = spentFen - daily.reduce((sum, day) => sum + day.spentFen, 0);
  const lastObservedIndex = Math.min(observedDays, dailyWeights.length) - 1;
  if (lastObservedIndex >= 0 && daily[lastObservedIndex]) {
    daily[lastObservedIndex] = {
      ...daily[lastObservedIndex],
      spentFen: daily[lastObservedIndex].spentFen + dailyDifference,
    };
  }
  const previousFen = trend.at(-2)?.spentFen ?? 0;
  const restaurantSpendFen = categories.find((item) => item.category === "restaurant")?.amountFen ?? 0;
  const groceriesSpendFen = categories.find((item) => item.category === "groceries")?.amountFen ?? 0;
  const restaurantPaymentCount = isPersonal ? 11 : 8;
  const elapsedDays = Math.max(1, observedDays);
  const remainingDays = period.key === currentMonth
    ? Math.max(1, dayCount(month) - elapsedDays + 1)
    : 0;
  const demoActivityDay = Math.max(1, Math.min(12, observedDays));

  return {
    viewer: {
      id: "gregor",
      name: "Gregor",
      email: "gregor@example.com",
      avatarUrl: "/assets/profile-avatar.png",
    },
    scope,
    groups,
    selectedGroupId: isPersonal ? undefined : requestedGroupId ?? "beijing-flat",
    period: {
      key: month,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
      isCurrentMonth: period.key === currentMonthKey(),
    },
    spentFen,
    budgetFen,
    metrics: {
      previousMonthDelta: previousFen > 0 ? (spentFen - previousFen) / previousFen : null,
      averageDailySpendFen: Math.round(spentFen / elapsedDays),
      availablePerDayFen: remainingDays
        ? Math.round(Math.max(0, budgetFen - spentFen) / remainingDays)
        : null,
      restaurantSpendFen,
      restaurantPaymentCount,
      averageRestaurantPaymentFen: Math.round(restaurantSpendFen / restaurantPaymentCount),
      groceriesSpendFen,
      legacyFoodSpendFen: 0,
    },
    trend,
    daily,
    categories,
    transactions: demoTransactions(month, isPersonal, demoActivityDay),
    balances: isPersonal ? [] : balances,
    imports: [
      { source: "wechat", transactionCount: 486, lastImportedAt: `${month}-${String(demoActivityDay).padStart(2, "0")}T21:10:00+08:00` },
      { source: "alipay", transactionCount: 318, lastImportedAt: `${month}-${String(demoActivityDay).padStart(2, "0")}T21:13:00+08:00` },
    ],
    topMerchant: {
      name: isPersonal ? "盒马鲜生" : "Apartment utilities",
      amountFen: isPersonal ? 46_200 : 74_000,
      visits: isPersonal ? 7 : 2,
    },
    biggestDay: {
      date: `${month}-${String(Math.min(10, demoActivityDay)).padStart(2, "0")}`,
      amountFen: Math.round(spentFen * 0.13),
    },
    generatedAt: new Date().toISOString(),
    revision: 1,
  };
}

function demoTransactions(
  month: string,
  isPersonal: boolean,
  observedDay: number,
): readonly DashboardTransaction[] {
  const date = (preferredDay: number, time: string) =>
    `${month}-${String(Math.min(preferredDay, observedDay)).padStart(2, "0")}T${time}+08:00`;
  const transactions: readonly DashboardTransaction[] = [
    {
      id: "tx-001",
      title: "Friday hotpot",
      merchant: "海底捞火锅",
      occurredAt: date(12, "20:42:00"),
      amountFen: 36_800,
      category: "restaurant",
      source: "wechat",
      paidBy: "Gregor",
      groupId: "beijing-flat",
      shared: true,
    },
    {
      id: "tx-002",
      title: "Groceries",
      merchant: "盒马鲜生",
      occurredAt: date(10, "18:11:00"),
      amountFen: 18_946,
      category: "groceries",
      source: "alipay",
      paidBy: "Gregor",
      groupId: "beijing-flat",
      shared: false,
    },
    {
      id: "tx-003",
      title: "Didi to Sanlitun",
      merchant: "滴滴出行",
      occurredAt: date(8, "22:03:00"),
      amountFen: 5_490,
      category: "transport",
      source: "wechat",
      paidBy: "Gregor",
      shared: false,
    },
    {
      id: "tx-004",
      title: "Coffee",
      merchant: "Manner Coffee",
      occurredAt: date(6, "10:15:00"),
      amountFen: 2_800,
      category: "leisure",
      source: "alipay",
      paidBy: "Gregor",
      shared: false,
    },
    {
      id: "tx-005",
      title: "HSK books",
      merchant: "京东",
      occurredAt: date(4, "13:26:00"),
      amountFen: 12_860,
      category: "shopping",
      source: "wechat",
      paidBy: "Gregor",
      shared: false,
    },
  ];
  return isPersonal
    ? transactions
    : transactions.filter((transaction) => transaction.groupId === "beijing-flat");
}
