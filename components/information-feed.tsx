"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";

import {
  INFORMATION_CATEGORY_LABELS,
  type InformationCategoryKey,
  type InformationItemRecord,
  type InformationSnapshot,
} from "@/lib/information/types";
import { INFORMATION_REFRESH_INTERVAL_MINUTES } from "@/lib/information/date";

type InformationFeedProps = {
  initialSnapshot: InformationSnapshot;
};

type InformationApiResponse = InformationSnapshot;

const categoryDescriptions: Record<InformationCategoryKey, string> = {
  company_update: "管理层、战略、财报与经营动作",
  deal_investment: "并购、投资、融资、上市与交易",
  macro_markets: "利率、油价、通胀、指数与宏观信号",
  ecommerce_retail: "平台、零售、供应链与消费渠道",
  ai_technology: "AI、芯片、软件、云与技术公司",
  policy_regulation: "政策、监管、关税、反垄断与规则",
};

const categoryTones: Record<
  InformationCategoryKey,
  {
    chipClassName: string;
    dotClassName: string;
    meterClassName: string;
  }
> = {
  company_update: {
    chipClassName:
      "border border-sky-300/20 bg-sky-300/10 text-sky-100",
    dotClassName: "bg-sky-300",
    meterClassName: "bg-sky-300",
  },
  deal_investment: {
    chipClassName:
      "border border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    dotClassName: "bg-emerald-300",
    meterClassName: "bg-emerald-300",
  },
  macro_markets: {
    chipClassName:
      "border border-amber-300/25 bg-amber-300/10 text-amber-100",
    dotClassName: "bg-amber-300",
    meterClassName: "bg-amber-300",
  },
  ecommerce_retail: {
    chipClassName:
      "border border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100",
    dotClassName: "bg-fuchsia-300",
    meterClassName: "bg-fuchsia-300",
  },
  ai_technology: {
    chipClassName:
      "border border-violet-300/20 bg-violet-300/10 text-violet-100",
    dotClassName: "bg-violet-300",
    meterClassName: "bg-violet-300",
  },
  policy_regulation: {
    chipClassName:
      "border border-rose-300/20 bg-rose-300/10 text-rose-100",
    dotClassName: "bg-rose-300",
    meterClassName: "bg-rose-300",
  },
};

function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatHeadlineTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRunAt(value: string | null | undefined) {
  if (!value) {
    return "尚未完成同步";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSourceLabel(item: InformationItemRecord) {
  return item.sourceName || item.feedLabel || item.sourceDomain;
}

function formatModelLabel(value: string | null | undefined) {
  if (!value) {
    return "未启动";
  }

  if (value === "heuristic-fallback") {
    return "规则回退分类";
  }

  if (value === "no-candidates") {
    return "无候选资讯";
  }

  if (value.includes("doubao")) {
    return "豆包分类模型";
  }

  return value;
}

function renderFeedRow(item: InformationItemRecord, keySuffix = "") {
  const tone = categoryTones[item.category];

  return (
    <article
      key={`${item.id}${keySuffix}`}
      className="group grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-white/8 px-4 py-2.5 transition hover:bg-white/[0.035] sm:grid-cols-[78px_minmax(0,1fr)]"
    >
      <div className="font-mono text-[0.78rem] font-medium tracking-[0.08em] text-amber-200">
        {formatHeadlineTime(item.publishedAt)}
      </div>

      <div className="min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="max-w-full truncate font-mono text-[0.7rem] tracking-[0.12em] text-amber-200/90">
              {formatSourceLabel(item)}
            </span>
            <h3 className="min-w-0 flex-1 text-[0.96rem] font-semibold leading-5 tracking-[-0.02em] text-white">
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-amber-100"
              >
                {item.title}
              </a>
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.74rem] text-slate-400">
            {item.author ? <span>{item.author}</span> : null}
            <span>{formatPublishedAt(item.publishedAt)}</span>
          </div>
          <p className="mt-1 text-[0.84rem] leading-6 text-slate-300">
            {item.summary}
          </p>
          <div className="mt-2">
            <span
              className={`inline-flex max-w-full items-center gap-2 rounded-full px-2.5 py-1 text-[0.64rem] font-medium uppercase tracking-[0.14em] ${tone.chipClassName}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${tone.dotClassName}`}
              />
              <span className="truncate">{item.categoryLabel}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function InformationFeed({ initialSnapshot }: InformationFeedProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [refreshError, setRefreshError] = useState<string | null>(
    initialSnapshot.error
  );
  const [isPending, startRefreshTransition] = useTransition();
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const lastRefreshAttemptAtRef = useRef(0);
  const feedScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const feedProgrammaticScrollRef = useRef(false);
  const feedAnimationFrameRef = useRef<number | null>(null);
  const lastFeedFrameAtRef = useRef<number | null>(null);
  const feedManualScrollingRef = useRef(false);
  const feedHoveringRef = useRef(false);
  const feedManualScrollStopTimerRef = useRef<number | null>(null);
  const items = useDeferredValue(snapshot.items);

  const fetchSnapshot = useEffectEvent(async () => {
    const response = await fetch("/api/information", {
      cache: "no-store",
    });

    const payload = (await response.json()) as
      | InformationApiResponse
      | { error?: string };

    if (!response.ok) {
      throw new Error(
        "error" in payload && payload.error ? payload.error : "资讯读取失败。"
      );
    }

    const nextSnapshot = payload as InformationApiResponse;

    setSnapshot(nextSnapshot);
    setRefreshError(nextSnapshot.error);

    if (
      nextSnapshot.stale &&
      Date.now() - lastRefreshAttemptAtRef.current >
        INFORMATION_REFRESH_INTERVAL_MINUTES * 60 * 1000
    ) {
      lastRefreshAttemptAtRef.current = Date.now();
      setIsAutoRefreshing(true);

      try {
        const refreshResponse = await fetch("/api/information", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ force: true }),
        });

        const refreshPayload = (await refreshResponse.json()) as
          | { snapshot?: InformationSnapshot; error?: string }
          | undefined;

        if (!refreshResponse.ok) {
          throw new Error(refreshPayload?.error ?? "自动刷新失败。");
        }

        if (refreshPayload?.snapshot) {
          const refreshedSnapshot = refreshPayload.snapshot;

          setSnapshot(refreshedSnapshot);
          setRefreshError(refreshedSnapshot.error);
        }
      } finally {
        setIsAutoRefreshing(false);
      }
    }
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchSnapshot().catch((error: unknown) => {
        setRefreshError(error instanceof Error ? error.message : "资讯轮询失败。");
      });
    }, 60_000);

    void fetchSnapshot().catch((error: unknown) => {
      setRefreshError(error instanceof Error ? error.message : "资讯读取失败。");
    });

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (feedManualScrollStopTimerRef.current != null) {
        window.clearTimeout(feedManualScrollStopTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const scrollArea = feedScrollAreaRef.current;

    if (!scrollArea) {
      return;
    }

    const maxScrollTop = Math.max(
      0,
      scrollArea.scrollHeight - scrollArea.clientHeight
    );

    if (scrollArea.scrollTop > maxScrollTop) {
      feedProgrammaticScrollRef.current = true;
      scrollArea.scrollTop = maxScrollTop;
    }
  }, [items]);

  useEffect(() => {
    const tick = (timestamp: number) => {
      const scrollArea = feedScrollAreaRef.current;

      if (lastFeedFrameAtRef.current == null) {
        lastFeedFrameAtRef.current = timestamp;
      }

      if (scrollArea) {
        const maxScrollTop = Math.max(
          0,
          scrollArea.scrollHeight - scrollArea.clientHeight
        );
        const isPaused =
          feedManualScrollingRef.current || feedHoveringRef.current;

        if (!isPaused && maxScrollTop > 0) {
          const deltaMs = timestamp - lastFeedFrameAtRef.current;
          const nextScrollTop = scrollArea.scrollTop + deltaMs * 0.08;

          feedProgrammaticScrollRef.current = true;
          scrollArea.scrollTop =
            nextScrollTop >= maxScrollTop ? 0 : nextScrollTop;
        }
      }

      lastFeedFrameAtRef.current = timestamp;
      feedAnimationFrameRef.current = window.requestAnimationFrame(tick);
    };

    feedAnimationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (feedAnimationFrameRef.current != null) {
        window.cancelAnimationFrame(feedAnimationFrameRef.current);
      }

      feedAnimationFrameRef.current = null;
      lastFeedFrameAtRef.current = null;
    };
  }, [items.length]);

  function handleManualRefresh() {
    startRefreshTransition(() => {
      void (async () => {
        setRefreshError(null);
        lastRefreshAttemptAtRef.current = Date.now();

        const response = await fetch("/api/information", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ force: true }),
        });

        const payload = (await response.json()) as
          | { snapshot?: InformationSnapshot; error?: string }
          | undefined;

        if (!response.ok) {
          throw new Error(payload?.error ?? "同步失败。");
        }

        if (payload?.snapshot) {
          const nextSnapshot = payload.snapshot;

          startTransition(() => {
            setSnapshot(nextSnapshot);
            setRefreshError(nextSnapshot.error);
          });
        }
      })().catch((error: unknown) => {
        setRefreshError(error instanceof Error ? error.message : "同步失败。");
      });
    });
  }

  const tickerMotionStyle = {
    "--ticker-duration": `${Math.max(22, items.length * 3)}s`,
    "--ticker-gap": "2.5rem",
  } as CSSProperties;

  function beginManualScroll() {
    feedManualScrollingRef.current = true;
  }

  function beginHoverPause() {
    feedHoveringRef.current = true;
  }

  function endHoverPause() {
    feedHoveringRef.current = false;
  }

  function scheduleManualScrollStop(delayMs = 120) {
    if (feedManualScrollStopTimerRef.current != null) {
      window.clearTimeout(feedManualScrollStopTimerRef.current);
    }

    feedManualScrollStopTimerRef.current = window.setTimeout(() => {
      feedManualScrollingRef.current = false;
      feedManualScrollStopTimerRef.current = null;
    }, delayMs);
  }

  function endManualScroll() {
    if (feedManualScrollStopTimerRef.current != null) {
      window.clearTimeout(feedManualScrollStopTimerRef.current);
      feedManualScrollStopTimerRef.current = null;
    }

    feedManualScrollingRef.current = false;
  }

  const statusLabel =
    isPending || isAutoRefreshing
      ? "同步中"
      : snapshot.stale
        ? "待刷新"
        : "在线";

  const orderedCategories = (
    Object.keys(INFORMATION_CATEGORY_LABELS) as InformationCategoryKey[]
  ).map((category) => ({
    category,
    label: INFORMATION_CATEGORY_LABELS[category],
    count: snapshot.countsByCategory[category],
    description: categoryDescriptions[category],
    tone: categoryTones[category],
  }));

  const strongestCategoryCount = Math.max(
    ...orderedCategories.map((entry) => entry.count),
    1
  );

  const tickerItems = items.slice(0, 10);

  return (
    <section className="relative mx-auto flex w-full max-w-[1540px] flex-col gap-4 px-3 py-3 text-white sm:px-5 lg:px-6 lg:py-4">
      <header className="information-shell overflow-hidden rounded-[1.7rem] border border-amber-300/20 shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-[0.72rem] tracking-[0.16em] text-slate-300">
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-amber-100">
              商业资讯线
            </span>
            <span>日期 {snapshot.dayKey}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[0.76rem] text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono tracking-[0.14em] text-white">
              {statusLabel}
            </span>
            <span>最近同步 {formatRunAt(snapshot.latestRun?.createdAt)}</span>
          </div>
        </div>

        <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,680px)] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-600"
                onClick={handleManualRefresh}
                disabled={isPending || isAutoRefreshing}
              >
                {isPending || isAutoRefreshing ? "同步进行中..." : "立即拉取新资讯"}
              </button>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-[0.78rem] uppercase tracking-[0.14em] text-slate-300">
                资讯 {String(snapshot.items.length).padStart(2, "0")} · 分类{" "}
                {String(
                  orderedCategories.filter((entry) => entry.count > 0).length
                ).padStart(2, "0")}
              </div>
            </div>

            {refreshError ? (
              <p className="mt-4 rounded-[0.95rem] border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm leading-6 text-rose-100">
                {refreshError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="font-mono text-[0.7rem] tracking-[0.16em] text-amber-200/70">
                原始抓取量
              </p>
              <p className="mt-3 font-mono text-[2rem] font-semibold text-white">
                {String(snapshot.latestRun?.rawCount ?? 0).padStart(3, "0")}
              </p>
            </div>
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="font-mono text-[0.7rem] tracking-[0.16em] text-amber-200/70">
                入库数量
              </p>
              <p className="mt-3 font-mono text-[2rem] font-semibold text-white">
                {String(snapshot.latestRun?.savedCount ?? 0).padStart(3, "0")}
              </p>
            </div>
            <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="font-mono text-[0.7rem] tracking-[0.16em] text-amber-200/70">
                分类模式
              </p>
              <p className="mt-3 break-all font-mono text-[0.9rem] leading-6 text-white">
                {formatModelLabel(snapshot.latestRun?.model)}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/8 bg-black/25 px-4 py-3 sm:px-5">
          <div className="information-ticker overflow-hidden rounded-full border border-white/8 bg-black/30 px-4 py-2">
            {tickerItems.length ? (
              <div
                className="information-ticker-track"
                style={tickerMotionStyle}
              >
                <div className="flex items-center gap-[var(--ticker-gap)]">
                  {tickerItems.map((item) => (
                    <a
                      key={item.id}
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex shrink-0 items-center gap-3 font-mono text-[0.76rem] tracking-[0.12em] text-slate-200 transition hover:text-amber-100"
                    >
                      <span className="text-amber-200">
                        {formatHeadlineTime(item.publishedAt)}
                      </span>
                      <span className="text-slate-500">/</span>
                      <span>{item.categoryLabel}</span>
                      <span className="text-slate-500">/</span>
                      <span className="max-w-[480px] truncate">
                        {item.title}
                      </span>
                    </a>
                  ))}
                </div>
                <div
                  aria-hidden="true"
                  className="flex items-center gap-[var(--ticker-gap)]"
                >
                  {tickerItems.map((item) => (
                    <a
                      key={`${item.id}:ticker`}
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex shrink-0 items-center gap-3 font-mono text-[0.76rem] tracking-[0.12em] text-slate-200 transition hover:text-amber-100"
                    >
                      <span className="text-amber-200">
                        {formatHeadlineTime(item.publishedAt)}
                      </span>
                      <span className="text-slate-500">/</span>
                      <span>{item.categoryLabel}</span>
                      <span className="text-slate-500">/</span>
                      <span className="max-w-[480px] truncate">
                        {item.title}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p className="font-mono text-[0.76rem] uppercase tracking-[0.16em] text-slate-400">
                等待新的商业资讯信号
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.16fr)_336px]">
        <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#04070c] shadow-[0_20px_70px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 font-mono text-[0.68rem] tracking-[0.16em] text-slate-500 sm:grid-cols-[78px_minmax(0,1fr)]">
              <span>时间</span>
              <span>信号内容</span>
            </div>
            <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[0.68rem] tracking-[0.14em] text-slate-400 lg:inline-flex">
              悬停暂停，离开继续
            </span>
          </div>

          <div
            ref={feedScrollAreaRef}
            className="information-feed-scroll-area relative h-[1000px] overflow-y-auto overscroll-contain"
            onMouseEnter={beginHoverPause}
            onMouseLeave={endHoverPause}
            onScroll={() => {
              const scrollArea = feedScrollAreaRef.current;

              if (!scrollArea) {
                return;
              }

              if (feedProgrammaticScrollRef.current) {
                feedProgrammaticScrollRef.current = false;
                return;
              }

              beginManualScroll();
              scheduleManualScrollStop();
            }}
            onWheel={() => {
              beginManualScroll();
              scheduleManualScrollStop();
            }}
            onTouchStart={beginManualScroll}
            onTouchEnd={endManualScroll}
            onTouchCancel={endManualScroll}
            onPointerDown={beginManualScroll}
            onPointerUp={endManualScroll}
            onPointerCancel={endManualScroll}
          >
            {items.length ? (
              <div className="grid pb-10">
                {items.map((item) => renderFeedRow(item))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <p className="font-mono text-[0.9rem] uppercase tracking-[0.16em] text-amber-200/75">
                  暂无信号
                </p>
                <p className="mt-3 text-[1.35rem] font-semibold tracking-[-0.03em] text-white">
                  暂无可滚动的当日商业资讯
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#060a11] shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
            <div className="border-b border-white/8 px-4 py-3">
              <p className="font-mono text-[0.72rem] tracking-[0.16em] text-amber-200/75">
                分类分布
              </p>
            </div>
            <div className="space-y-3 px-4 py-4">
              {orderedCategories.map((entry) => (
                <div
                  key={entry.category}
                  className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${entry.tone.dotClassName}`}
                      />
                      <p className="truncate text-[0.9rem] font-medium text-white">
                        {entry.label}
                      </p>
                    </div>
                    <span className="font-mono text-[0.82rem] text-slate-300">
                      {String(entry.count).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.8rem] leading-6 text-slate-400">
                    {entry.description}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/7">
                    <div
                      className={`h-full rounded-full ${entry.tone.meterClassName}`}
                      style={{
                        width: `${Math.max(
                          8,
                          (entry.count / strongestCategoryCount) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.4rem] border border-white/10 bg-[#060a11] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
            <p className="font-mono text-[0.72rem] tracking-[0.16em] text-amber-200/75">
              采集链路
            </p>
            <div className="mt-4 grid gap-2 font-mono text-[0.78rem] tracking-[0.1em] text-slate-300">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-2">
                <span>原始</span>
                <span>{String(snapshot.latestRun?.rawCount ?? 0).padStart(3, "0")}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-2">
                <span>候选</span>
                <span>{String(snapshot.latestRun?.candidateCount ?? 0).padStart(3, "0")}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-2">
                <span>保留</span>
                <span>{String(snapshot.latestRun?.keptCount ?? 0).padStart(3, "0")}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>入库</span>
                <span>{String(snapshot.latestRun?.savedCount ?? 0).padStart(3, "0")}</span>
              </div>
            </div>
          </section>

          <section className="rounded-[1.4rem] border border-white/10 bg-[#060a11] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
            <p className="font-mono text-[0.72rem] tracking-[0.16em] text-amber-200/75">
              过滤规则
            </p>
            <div className="mt-4 space-y-2 text-[0.83rem] leading-6 text-slate-300">
              <p>保留公司、交易、市场、电商、AI、监管。</p>
              <p>过滤事故、犯罪、导购、榜单、娱乐和泛热点。</p>
              <p>先规则筛，再由 LangGraph 节点复核分类。</p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
