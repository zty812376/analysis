import { runInformationAgent } from "@/lib/langgraph/information-agent";
import {
  INFORMATION_TIMEZONE,
  formatInformationDayKey,
  isInformationStale,
} from "@/lib/information/date";
import { filterDisplayableInformationItems } from "@/lib/information/content-filter";
import {
  countInformationItemsByCategory,
  getLatestInformationRun,
  getLatestInformationRunForDay,
  listInformationItemsByDay,
  listLatestInformationItems,
} from "@/lib/information/storage";
import type { InformationSnapshot } from "@/lib/information/types";

type GlobalInformationRefreshState = typeof globalThis & {
  __analysisInformationRefreshes__?: Map<
    string,
    ReturnType<typeof runInformationAgent>
  >;
};

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : "资讯同步失败。";
}

function getRefreshMap() {
  const globalState = globalThis as GlobalInformationRefreshState;

  if (!globalState.__analysisInformationRefreshes__) {
    globalState.__analysisInformationRefreshes__ = new Map();
  }

  return globalState.__analysisInformationRefreshes__;
}

export async function refreshInformationFeed(input?: {
  dayKey?: string;
  force?: boolean;
}) {
  const dayKey = input?.dayKey ?? formatInformationDayKey(new Date());
  const latestRunForDay = await getLatestInformationRunForDay(dayKey);

  if (
    !input?.force &&
    latestRunForDay &&
    latestRunForDay.status === "completed" &&
    latestRunForDay.savedCount > 0 &&
    !isInformationStale(latestRunForDay.createdAt, dayKey)
  ) {
    return {
      dayKey,
      runId: latestRunForDay.id,
      model: latestRunForDay.model,
      rawCount: latestRunForDay.rawCount,
      candidateCount: latestRunForDay.candidateCount,
      keptCount: latestRunForDay.keptCount,
      savedCount: latestRunForDay.savedCount,
      notes: ["refresh: reused a recent daily run"],
      errors: [],
    };
  }

  const refreshes = getRefreshMap();
  const existing = refreshes.get(dayKey);

  if (existing) {
    return existing;
  }

  const task = runInformationAgent({ dayKey }).finally(() => {
    refreshes.delete(dayKey);
  });

  refreshes.set(dayKey, task);

  return task;
}

export async function getInformationSnapshot(input?: {
  limit?: number | null;
  hydrateIfEmpty?: boolean;
}): Promise<InformationSnapshot> {
  const limit =
    typeof input?.limit === "number" &&
    Number.isFinite(input.limit) &&
    input.limit > 0
      ? Math.floor(input.limit)
      : null;
  const queryLimit = limit ? limit * 3 : null;
  const dayKey = formatInformationDayKey(new Date());
  let error: string | null = null;

  if (input?.hydrateIfEmpty) {
    const todayRun = await getLatestInformationRunForDay(dayKey);
    const todayItems = filterDisplayableInformationItems(
      await listInformationItemsByDay(dayKey, queryLimit)
    ).slice(0, limit ?? undefined);

    if (
      !todayRun ||
      todayRun.status === "failed" ||
      todayItems.length === 0
    ) {
      try {
        await refreshInformationFeed({ dayKey, force: true });
      } catch (refreshError) {
        error = normalizeError(refreshError);
      }
    }
  }

  const latestRun = await getLatestInformationRun();
  const todayItems = filterDisplayableInformationItems(
    await listInformationItemsByDay(dayKey, queryLimit)
  ).slice(0, limit ?? undefined);
  const items =
    todayItems.length > 0
      ? todayItems
      : filterDisplayableInformationItems(
          await listLatestInformationItems(queryLimit)
        ).slice(0, limit ?? undefined);

  return {
    dayKey,
    items,
    latestRun,
    countsByCategory: countInformationItemsByCategory(items),
    stale: !todayItems.length || isInformationStale(latestRun?.createdAt, dayKey),
    hasTodayItems: todayItems.length > 0,
    error,
  };
}

export { INFORMATION_TIMEZONE };
