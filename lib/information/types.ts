export const INFORMATION_CATEGORIES = [
  {
    key: "company_update",
    label: "公司动态",
  },
  {
    key: "deal_investment",
    label: "并购投融资",
  },
  {
    key: "macro_markets",
    label: "宏观与市场",
  },
  {
    key: "ecommerce_retail",
    label: "电商零售",
  },
  {
    key: "ai_technology",
    label: "AI 与科技",
  },
  {
    key: "policy_regulation",
    label: "政策监管",
  },
] as const;

export type InformationCategoryKey =
  (typeof INFORMATION_CATEGORIES)[number]["key"];

export type InformationRunStatus = "completed" | "failed";

export const INFORMATION_CATEGORY_LABELS = Object.fromEntries(
  INFORMATION_CATEGORIES.map((category) => [category.key, category.label])
) as Record<InformationCategoryKey, string>;

export function createEmptyCategoryCounts() {
  return {
    company_update: 0,
    deal_investment: 0,
    macro_markets: 0,
    ecommerce_retail: 0,
    ai_technology: 0,
    policy_regulation: 0,
  } satisfies Record<InformationCategoryKey, number>;
}

export type InformationItemRecord = {
  id: string;
  dayKey: string;
  category: InformationCategoryKey;
  categoryLabel: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceDomain: string;
  sourceUrl: string;
  feedKey: string;
  feedLabel: string;
  author: string | null;
  publishedAt: string;
  tags: string[];
  reasoning: string;
};

export type InformationRunRecord = {
  id: string;
  targetDay: string;
  status: InformationRunStatus;
  sourceCount: number;
  rawCount: number;
  candidateCount: number;
  keptCount: number;
  savedCount: number;
  model: string;
  createdAt: string;
};

export type InformationSnapshot = {
  dayKey: string;
  items: InformationItemRecord[];
  latestRun: InformationRunRecord | null;
  countsByCategory: Record<InformationCategoryKey, number>;
  stale: boolean;
  hasTodayItems: boolean;
  error: string | null;
};
