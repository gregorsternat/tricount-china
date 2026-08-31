import type { TransactionCategory } from "@/lib/dashboard/types";

const groceryKeywords = [
  "超市", "便利店", "生鲜", "盒马", "买菜", "果蔬", "supermarket",
  "grocery", "groceries", "convenience store", "hema", "carrefour",
  "aldi", "sam's club", "sams club",
];

const restaurantKeywords = [
  "餐饮", "餐厅", "饭店", "外卖", "火锅", "烧烤", "美食", "restaurant",
  "takeaway", "delivery", "hotpot", "meituan", "ele.me", "饿了么",
];

const coffeeKeywords = ["咖啡", "coffee", "cafe", "café", "奶茶", "tea shop"];

const explicitCategories: ReadonlyArray<
  readonly [TransactionCategory, readonly string[]]
> = [
  ["groceries", ["groceries", "grocery", "courses"]],
  ["restaurant", ["restaurant", "restaurants"]],
  ["transport", ["transport", "taxi", "metro", "train", "交通"]],
  ["housing", ["housing", "rent", "home", "logement", "房租"]],
  ["shopping", ["shopping", "购物"]],
  ["leisure", ["leisure", "loisirs", "娱乐"]],
  ["travel", ["travel", "trip", "voyage", "旅行"]],
  ["health", ["health", "santé", "医疗"]],
  ["other", ["other"]],
];

export function normalizeTransactionCategory(
  category: string | null | undefined,
  context = "",
): TransactionCategory {
  const raw = category?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const haystack = `${raw} ${context}`.toLocaleLowerCase("zh-CN");

  if (!["food", "食品"].includes(raw)) {
    const explicit = explicitCategories.find(([, aliases]) => aliases.includes(raw));
    if (explicit) return explicit[0];
  }

  if (coffeeKeywords.some((keyword) => haystack.includes(keyword))) return "leisure";
  if (groceryKeywords.some((keyword) => haystack.includes(keyword))) return "groceries";
  if (restaurantKeywords.some((keyword) => haystack.includes(keyword))) return "restaurant";
  if (["food", "食品"].includes(raw)) return "food";
  return "other";
}

export const __testables = {
  coffeeKeywords,
  explicitCategories,
  groceryKeywords,
  restaurantKeywords,
};
