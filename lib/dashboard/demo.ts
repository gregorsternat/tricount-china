import type {
  CategorySpend,
  DashboardGroup,
  DashboardScope,
  DashboardSnapshot,
  DashboardTransaction,
  MemberBalance,
  MonthlySpend,
} from "@/lib/dashboard/types";

const groups: readonly DashboardGroup[] = [
  {
    id: "beijing-flat",
    name: "Coloc Beijing",
    city: "北京",
    memberCount: 4,
    spentFen: 1_426_970,
    accent: "#c9ff63",
  },
  {
    id: "semester-trips",
    name: "Voyages du semestre",
    city: "中国",
    memberCount: 6,
    spentFen: 809_860,
    accent: "#ffb264",
  },
  {
    id: "language-class",
    name: "Classe de chinois",
    city: "北京",
    memberCount: 8,
    spentFen: 234_540,
    accent: "#8ed9cf",
  },
];

const personalMonthly: readonly MonthlySpend[] = [
  ["2025-09", "Sep", 164_220, 220_000],
  ["2025-10", "Oct", 208_480, 220_000],
  ["2025-11", "Nov", 176_360, 220_000],
  ["2025-12", "Déc", 241_190, 220_000],
  ["2026-01", "Jan", 286_740, 250_000],
  ["2026-02", "Fév", 198_620, 220_000],
  ["2026-03", "Mar", 210_980, 220_000],
  ["2026-04", "Avr", 184_530, 220_000],
  ["2026-05", "Mai", 203_890, 220_000],
  ["2026-06", "Juin", 178_270, 220_000],
  ["2026-07", "Juil", 245_430, 250_000],
  ["2026-08", "Août", 286_056, 250_000],
].map(([key, label, spentFen, budgetFen]) => ({
  key: String(key),
  label: String(label),
  spentFen: Number(spentFen),
  budgetFen: Number(budgetFen),
  observed: true,
}));

const groupMonthly: readonly MonthlySpend[] = personalMonthly.map((month, index) => ({
  ...month,
  spentFen: Math.round(month.spentFen * (index % 3 === 0 ? 1.54 : 1.37)),
  budgetFen: Math.round(month.budgetFen * 1.45),
}));

const personalCategories: readonly CategorySpend[] = [
  { category: "food", label: "Restaurants & courses", amountFen: 704_612, color: "#173f35" },
  { category: "housing", label: "Logement", amountFen: 596_192, color: "#8fcf52" },
  { category: "travel", label: "Voyages", amountFen: 405_410, color: "#e9945e" },
  { category: "transport", label: "Transports", amountFen: 333_867, color: "#8acac2" },
  { category: "other", label: "Autres", amountFen: 544_685, color: "#e8dfce" },
];

const groupCategories: readonly CategorySpend[] = [
  { category: "housing", label: "Logement", amountFen: 1_084_000, color: "#173f35" },
  { category: "food", label: "Restaurants & courses", amountFen: 806_240, color: "#8fcf52" },
  { category: "travel", label: "Voyages", amountFen: 618_510, color: "#e9945e" },
  { category: "transport", label: "Transports", amountFen: 411_870, color: "#8acac2" },
  { category: "other", label: "Autres", amountFen: 755_602, color: "#e8dfce" },
];

const transactions: readonly DashboardTransaction[] = [
  {
    id: "tx-001",
    title: "Hotpot du vendredi",
    merchant: "海底捞火锅",
    occurredAt: "2026-08-29T20:42:00+08:00",
    amountFen: 36_800,
    category: "food",
    source: "wechat",
    paidBy: "Gregor",
    groupId: "beijing-flat",
    shared: true,
  },
  {
    id: "tx-002",
    title: "Train pour Qingdao",
    merchant: "中国铁路",
    occurredAt: "2026-08-28T09:18:00+08:00",
    amountFen: 27_200,
    category: "travel",
    source: "alipay",
    paidBy: "Gregor",
    groupId: "semester-trips",
    shared: true,
  },
  {
    id: "tx-003",
    title: "Courses de la coloc",
    merchant: "盒马鲜生",
    occurredAt: "2026-08-27T18:11:00+08:00",
    amountFen: 18_946,
    category: "food",
    source: "alipay",
    paidBy: "Gregor",
    groupId: "beijing-flat",
    shared: false,
  },
  {
    id: "tx-004",
    title: "Didi vers Sanlitun",
    merchant: "滴滴出行",
    occurredAt: "2026-08-26T22:03:00+08:00",
    amountFen: 5_490,
    category: "transport",
    source: "wechat",
    paidBy: "Gregor",
    shared: false,
  },
  {
    id: "tx-005",
    title: "Livres HSK 5",
    merchant: "京东",
    occurredAt: "2026-08-24T13:26:00+08:00",
    amountFen: 12_860,
    category: "shopping",
    source: "wechat",
    paidBy: "Gregor",
    groupId: "language-class",
    shared: false,
  },
  {
    id: "tx-006",
    title: "Café de quartier",
    merchant: "Manner Coffee",
    occurredAt: "2026-08-23T10:15:00+08:00",
    amountFen: 2_800,
    category: "food",
    source: "alipay",
    paidBy: "Gregor",
    shared: false,
  },
];

const balances: readonly MemberBalance[] = [
  { id: "gregor", name: "Gregor", avatarUrl: "/assets/profile-avatar.png", isCurrentUser: true, balanceFen: 28_760 },
  { id: "lea", name: "Léa", balanceFen: 12_420 },
  { id: "yanis", name: "Yanis", balanceFen: -17_310 },
  { id: "xiaoyu", name: "小雨", balanceFen: -23_870 },
];

export function createDemoDashboard(scope: DashboardScope = "personal"): DashboardSnapshot {
  const isPersonal = scope === "personal";
  const monthly = isPersonal ? personalMonthly : groupMonthly;
  const categories = isPersonal ? personalCategories : groupCategories;
  const spentFen = monthly.reduce((total, month) => total + month.spentFen, 0);
  const budgetFen = monthly.reduce((total, month) => total + month.budgetFen, 0);

  return {
    viewer: {
      id: "gregor",
      name: "Gregor",
      email: "gregor@example.com",
      avatarUrl: "/assets/profile-avatar.png",
    },
    scope,
    groups,
    selectedGroupId: isPersonal ? undefined : "beijing-flat",
    academicYear: {
      label: "2025–2026",
      startsOn: "2025-09-01",
      endsOn: "2026-08-31",
    },
    spentFen,
    budgetFen,
    previousPeriodDelta: isPersonal ? -0.084 : 0.036,
    monthly,
    categories,
    transactions: isPersonal
      ? transactions
      : transactions.filter((transaction) => transaction.groupId === "beijing-flat"),
    balances: isPersonal ? [] : balances,
    imports: [
      { source: "wechat", transactionCount: 486, lastImportedAt: "2026-08-30T21:10:00+08:00" },
      { source: "alipay", transactionCount: 318, lastImportedAt: "2026-08-30T21:13:00+08:00" },
    ],
    topMerchant: {
      name: isPersonal ? "盒马鲜生" : "房东 · Lianjia",
      amountFen: isPersonal ? 84_620 : 728_000,
      visits: isPersonal ? 18 : 8,
    },
    busiestDay: {
      label: "Samedi",
      amountFen: isPersonal ? 421_650 : 613_420,
    },
    generatedAt: "2026-08-31T09:00:00+08:00",
    revision: 1,
  };
}
