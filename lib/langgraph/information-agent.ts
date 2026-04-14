import { createHash } from "node:crypto";

import { END, START, ReducedValue, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

import {
  fetchRssFeed,
  type CollectedFeedItem,
} from "@/lib/information/rss";
import { INFORMATION_FEED_SOURCES } from "@/lib/information/sources";
import {
  INFORMATION_TIMEZONE,
  isInformationPublishedOnDay,
} from "@/lib/information/date";
import { saveInformationRun } from "@/lib/information/storage";
import type { InformationCategoryKey } from "@/lib/information/types";
import {
  DOUBAO_SEMANTIC_CHUNK_MODEL,
  createDoubaoChatCompletion,
  getDoubaoApiKey,
} from "@/lib/llm/doubao";

const InformationCategorySchema = z.enum([
  "company_update",
  "deal_investment",
  "macro_markets",
  "ecommerce_retail",
  "ai_technology",
  "policy_regulation",
]);

const RawFeedItemSchema = z.object({
  feedKey: z.string(),
  feedLabel: z.string(),
  title: z.string(),
  description: z.string(),
  topics: z.array(z.string()).default(() => []),
  sourceName: z.string(),
  sourceDomain: z.string(),
  sourceUrl: z.string(),
  author: z.string().nullable().default(null),
  publishedAt: z.string(),
});

const ClassifiedItemSchema = RawFeedItemSchema.extend({
  id: z.string(),
  category: InformationCategorySchema,
  summary: z.string(),
  importanceScore: z.number().int().min(1).max(10),
  tags: z.array(z.string()).default(() => []),
  reasoning: z.string(),
});

const ModelClassificationSchema = z.array(
  z.object({
    id: z.string(),
    keep: z.boolean(),
    category: z
      .enum([
        "company_update",
        "deal_investment",
        "macro_markets",
        "ecommerce_retail",
        "ai_technology",
        "policy_regulation",
        "drop",
      ])
      .default("drop"),
    summaryZh: z.string(),
    importanceScore: z.number().int().min(1).max(10),
    tagsZh: z.array(z.string()).default(() => []),
    reasoning: z.string(),
  })
);

type RawFeedItem = z.infer<typeof RawFeedItemSchema>;
type ClassifiedItem = z.infer<typeof ClassifiedItemSchema>;
type InformationSourceConfig = (typeof INFORMATION_FEED_SOURCES)[number];

const InformationStateSchema = new StateSchema({
  dayKey: z.string(),
  timezone: z.string().default(INFORMATION_TIMEZONE),
  rawItems: z.array(RawFeedItemSchema).default(() => []),
  candidates: z.array(RawFeedItemSchema).default(() => []),
  classifiedItems: z.array(ClassifiedItemSchema).default(() => []),
  savedCount: z.number().default(0),
  runId: z.string().default(""),
  model: z.string().default(""),
  notes: new ReducedValue(z.array(z.string()).default(() => []), {
    inputSchema: z.string(),
    reducer: (current, next) => [...current, next],
  }),
  errors: new ReducedValue(z.array(z.string()).default(() => []), {
    inputSchema: z.string(),
    reducer: (current, next) => [...current, next],
  }),
});

type InformationState = typeof InformationStateSchema.State;

const sourceConfigByKey = new Map<string, InformationSourceConfig>(
  INFORMATION_FEED_SOURCES.map((source) => [source.key, source])
);

const noisyPatterns = [
  /\bdeal(s)? to shop\b/i,
  /\bbest amazon deals\b/i,
  /\bshop picks\b/i,
  /\bstyle hack\b/i,
  /\bwhat to wear\b/i,
  /\bcoupon\b/i,
  /\bdiscount code\b/i,
  /\brobbery suspect\b/i,
  /\bshooting\b/i,
  /\bcar crash\b/i,
  /\baccident\b/i,
  /\bweather alert\b/i,
  /\bgift guide\b/i,
  /车祸|撞车|追尾|事故|爆炸|火灾|坠机|遇难|身亡|命案|凶杀|枪击|抢劫/u,
  /地震|洪水|暴雨|台风|灾害|搜救|失联|失踪/u,
  /演唱会|综艺|恋情|离婚|八卦|塌房|穿搭|妆容|减肥|追剧|影评/u,
  /优惠券|折扣码|必买清单|好物推荐|值得买|种草清单|旅游攻略/u,
  /足球|篮球|网球|赛艇|比分|联赛|奥运/u,
];

const businessSignalPatterns = [
  /公司|集团|企业|品牌|平台|业务|战略|财报|业绩|营收|利润|亏损|估值|订单|产能|供应链|渠道|门店|出海/u,
  /并购|收购|合并|交易|投资|融资|募资|基金|风投|创投|股权|上市|IPO|一级市场|二级市场/u,
  /宏观|经济|市场|股市|A股|港股|美股|债券|汇率|利率|通胀|油价|金价|央行|财政|关税/u,
  /政策|监管|反垄断|条例|税务|税收|补贴|部委|证监会|商务部|发改委|工信部/u,
  /电商|零售|消费|物流|跨境|仓储|商家|平台商家|履约|配送|直播电商/u,
  /AI|人工智能|大模型|芯片|半导体|软件|云计算|机器人|自动驾驶|智驾|算力|互联网/u,
  /\b(acquisition|acquire|merger|investment|funding|financing|ipo|market|stocks?|bond|economy|inflation|tariff|regulation|policy|retail|e-?commerce|ai|chip|semiconductor|cloud)\b/i,
];

const businessTopicPatterns = [
  /公司|商业|财经|金融|创投|投资|融资|上市|产业|科技|AI|互联网|芯片|半导体|电商|零售|消费|物流|跨境|汽车|供应链|政策|监管|市场/u,
];

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getSourceConfig(feedKey: string) {
  return sourceConfigByKey.get(feedKey);
}

function getCombinedItemText(item: RawFeedItem) {
  return normalizeText(
    [
      item.title,
      item.description,
      item.topics.join(" "),
      item.sourceUrl,
    ].join(" ")
  );
}

function hasBusinessSignal(text: string) {
  return businessSignalPatterns.some((pattern) => pattern.test(text));
}

function hasBusinessTopic(topics: string[]) {
  return topics.some((topic) =>
    businessTopicPatterns.some((pattern) => pattern.test(topic))
  );
}

function buildStableId(item: RawFeedItem) {
  return createHash("sha256")
    .update(`${item.sourceUrl}|${item.title}|${item.publishedAt}`)
    .digest("hex");
}

function inferCategory(text: string): InformationCategoryKey {
  if (
    /并购|收购|合并|融资|募资|注资|领投|跟投|IPO|股权交易|并表|估值|挂牌上市|上市公司/u.test(
      text
    ) ||
    /\b(acquisition|acquire|acquires|merger|deal\b|buyout|investment|funding|fundraise|raises|raised|ipo|venture|financing)\b/i.test(
      text
    )
  ) {
    return "deal_investment";
  }

  if (
    /监管|政策|关税|反垄断|法案|条例|税务|罚款|审查|工信部|发改委|证监会|央行|商务部|若干意见|通知/u.test(
      text
    ) ||
    /\b(regulation|regulator|policy|tariff|antitrust|law|government|commission|sanction|tax)\b/i.test(
      text
    )
  ) {
    return "policy_regulation";
  }

  if (
    /宏观|经济|市场|股市|A股|港股|美股|债券|汇率|利率|通胀|油价|金价|GDP|财政|出口|贸易|期货|交易所|保证金|涨跌停|指数/u.test(
      text
    ) ||
    /\b(inflation|market|stocks?|bonds?|fed|ecb|oil|economy|gdp|consumer sentiment|trade)\b/i.test(
      text
    )
  ) {
    return "macro_markets";
  }

  if (
    /电商|零售|消费|商家|平台|超市|门店|仓储|物流|配送|跨境|直播电商|即时零售/u.test(
      text
    ) ||
    /\b(retail|e-?commerce|shop|amazon|target|walmart|nike|consumer|store|delivery)\b/i.test(
      text
    )
  ) {
    return "ecommerce_retail";
  }

  if (
    /AI|人工智能|大模型|芯片|半导体|软件|云|机器人|算力|自动驾驶|智驾|互联网|科技/u.test(
      text
    ) ||
    /\b(ai|artificial intelligence|chip|semiconductor|openai|software|cloud|startup|agent|tech)\b/i.test(
      text
    )
  ) {
    return "ai_technology";
  }

  return "company_update";
}

function shouldKeepCandidate(item: RawFeedItem) {
  const combined = getCombinedItemText(item);
  const sourceConfig = getSourceConfig(item.feedKey);

  if (!item.title || !item.sourceUrl) {
    return false;
  }

  if (item.sourceUrl.includes("/spons/")) {
    return false;
  }

  if (noisyPatterns.some((pattern) => pattern.test(combined))) {
    return false;
  }

  if (sourceConfig?.strictBusinessFilter) {
    return hasBusinessSignal(combined) || hasBusinessTopic(item.topics);
  }

  return true;
}

function classifyHeuristically(items: RawFeedItem[]) {
  return items
    .filter(shouldKeepCandidate)
    .map<ClassifiedItem>((item) => {
      const combined = getCombinedItemText(item);
      const summary =
        item.description && item.description.length > 16
          ? `来源 ${item.sourceName}：${item.description}`
          : `来源 ${item.sourceName}：${item.title}`;
      const topicTags = item.topics
        .map((topic) => normalizeText(topic))
        .filter(Boolean)
        .slice(0, 2);

      return {
        ...item,
        id: buildStableId(item),
        category: inferCategory(combined),
        summary: normalizeText(summary).slice(0, 120),
        importanceScore: 5,
        tags: [
          item.feedLabel,
          ...topicTags,
          item.sourceDomain || item.sourceName,
        ].filter(Boolean),
        reasoning: "未配置模型，已按中文关键词、栏目标签和来源规则分类。",
      };
    });
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function extractJsonArray(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  throw new Error("模型返回中没有找到 JSON 数组。");
}

async function classifyWithModel(items: RawFeedItem[]) {
  const batches = chunkItems(items, 8);
  const classifiedItems: ClassifiedItem[] = [];

  for (const batch of batches) {
    const response = await createDoubaoChatCompletion({
      systemPrompt: [
        "你是一名商业资讯编辑，负责筛选并分类当天来自中文信息源的资讯。",
        "只保留真正和商业、公司、并购、投融资、宏观市场、电商零售、AI 科技、政策监管有关的资讯。",
        "必须丢弃以下类型：事故、犯罪、灾难、娱乐八卦、名人穿搭、购物清单、折扣推荐、消费导购、体育、文化生活方式、与商业影响无关的泛社会热点。",
        "分类只能是：company_update、deal_investment、macro_markets、ecommerce_retail、ai_technology、policy_regulation、drop。",
        "summaryZh 输出简洁中文摘要，一条不超过 70 个汉字。",
        "tagsZh 输出 2 到 4 个简短中文标签。",
        "importanceScore 为 1 到 10 的整数，10 表示市场或行业影响很强。",
        "严格返回 JSON 数组，不要额外解释。",
      ].join("\n"),
      userPrompt: JSON.stringify(
        batch.map((item) => ({
          id: buildStableId(item),
          title: item.title,
          description: item.description,
          topics: item.topics,
          sourceName: item.sourceName,
          sourceDomain: item.sourceDomain,
          sourceUrl: item.sourceUrl,
          publishedAt: item.publishedAt,
        })),
        null,
        2
      ),
      temperature: 0.1,
      maxTokens: 2600,
    });

    const payload = ModelClassificationSchema.parse(
      JSON.parse(extractJsonArray(response.content))
    );

    for (const item of batch) {
      const classified = payload.find((entry) => entry.id === buildStableId(item));

      if (!classified || !classified.keep || classified.category === "drop") {
        continue;
      }

      classifiedItems.push({
        ...item,
        id: buildStableId(item),
        category: classified.category,
        summary: normalizeText(classified.summaryZh).slice(0, 120),
        importanceScore: classified.importanceScore,
        tags: classified.tagsZh.map((tag) => normalizeText(tag)).filter(Boolean),
        reasoning: normalizeText(classified.reasoning),
      });
    }
  }

  return classifiedItems;
}

const collectFeeds: typeof InformationStateSchema.Node = async () => {
  const settled = await Promise.allSettled(
    INFORMATION_FEED_SOURCES.map((source) => fetchRssFeed(source))
  );

  const rawItems: CollectedFeedItem[] = [];
  const errors: string[] = [];

  for (const [index, result] of settled.entries()) {
    const source = INFORMATION_FEED_SOURCES[index];

    if (result.status === "fulfilled") {
      rawItems.push(...result.value);
      continue;
    }

    errors.push(`${source?.label ?? "未知源"}：${result.reason instanceof Error ? result.reason.message : "抓取失败。"}`);
  }

  return {
    rawItems,
    notes: `collect: fetched ${rawItems.length} raw items from ${INFORMATION_FEED_SOURCES.length} feeds`,
    ...(errors.length ? { errors: errors.join(" | ") } : {}),
  };
};

const filterCandidates: typeof InformationStateSchema.Node = (state) => {
  const seen = new Set<string>();
  const candidates = state.rawItems.filter((item) => {
    if (
      !isInformationPublishedOnDay(item.publishedAt, state.dayKey, state.timezone)
    ) {
      return false;
    }

    const id = buildStableId(item);

    if (seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });

  return {
    candidates,
    notes: `filter: reduced ${state.rawItems.length} raw items to ${candidates.length} unique candidates`,
  };
};

const classifyCandidates: typeof InformationStateSchema.Node = async (state) => {
  if (!state.candidates.length) {
    return {
      model: "no-candidates",
      notes: "classify: skipped because no candidates were collected",
    };
  }

  const heuristicCandidates = state.candidates.filter(shouldKeepCandidate);

  try {
    if (!getDoubaoApiKey()) {
      const classifiedItems = classifyHeuristically(heuristicCandidates);

      return {
        classifiedItems,
        model: "heuristic-fallback",
        notes: `classify: kept ${classifiedItems.length} items via heuristic fallback`,
      };
    }

    const classifiedItems = await classifyWithModel(heuristicCandidates);

    return {
      classifiedItems,
      model: DOUBAO_SEMANTIC_CHUNK_MODEL,
      notes: `classify: kept ${classifiedItems.length} items via ${DOUBAO_SEMANTIC_CHUNK_MODEL}`,
    };
  } catch (error) {
    const classifiedItems = classifyHeuristically(heuristicCandidates);

    return {
      classifiedItems,
      model: "heuristic-fallback",
      notes: `classify: fell back to heuristic mode with ${classifiedItems.length} items`,
      errors:
        error instanceof Error
          ? `分类模型失败，已回退规则模式：${error.message}`
          : "分类模型失败，已回退规则模式。",
    };
  }
};

const persistCandidates: typeof InformationStateSchema.Node = async (state) => {
  const status =
    !state.rawItems.length && state.errors.length > 0 ? "failed" : "completed";
  const run = await saveInformationRun({
    targetDay: state.dayKey,
    timezone: state.timezone,
    status,
    sourceCount: INFORMATION_FEED_SOURCES.length,
    sourceKeys: INFORMATION_FEED_SOURCES.map((source) => source.key),
    rawCount: state.rawItems.length,
    candidateCount: state.candidates.length,
    keptCount: state.classifiedItems.length,
    items: state.classifiedItems.map((item) => ({
      dayKey: state.dayKey,
      category: item.category,
      title: item.title,
      summary: item.summary,
      sourceName: item.sourceName,
      sourceDomain: item.sourceDomain,
      sourceUrl: item.sourceUrl,
      feedKey: item.feedKey,
      feedLabel: item.feedLabel,
      author: item.author,
      publishedAt: item.publishedAt,
      importanceScore: item.importanceScore,
      tags: item.tags,
      reasoning: item.reasoning,
      originalDescription: item.description,
      rawPayload: item,
    })),
    model: state.model || "unknown",
    notes: state.notes,
    errors: state.errors,
  });

  return {
    savedCount: run.savedCount,
    runId: run.id,
    notes: `persist: saved ${run.savedCount} items into PostgreSQL`,
  };
};

const informationWorkflow = new StateGraph(InformationStateSchema)
  .addNode("collect", collectFeeds)
  .addNode("filter", filterCandidates)
  .addNode("classify", classifyCandidates)
  .addNode("persist", persistCandidates)
  .addEdge(START, "collect")
  .addEdge("collect", "filter")
  .addEdge("filter", "classify")
  .addEdge("classify", "persist")
  .addEdge("persist", END)
  .compile({
    name: "business-information-agent",
  });

export type InformationIngestResult = {
  dayKey: string;
  runId: string;
  model: string;
  rawCount: number;
  candidateCount: number;
  keptCount: number;
  savedCount: number;
  notes: string[];
  errors: string[];
};

export async function runInformationAgent(input: { dayKey: string }) {
  const result = (await informationWorkflow.invoke({
    dayKey: input.dayKey,
  })) as InformationState;

  return {
    dayKey: input.dayKey,
    runId: result.runId,
    model: result.model,
    rawCount: result.rawItems.length,
    candidateCount: result.candidates.length,
    keptCount: result.classifiedItems.length,
    savedCount: result.savedCount,
    notes: result.notes,
    errors: result.errors,
  } satisfies InformationIngestResult;
}
