import type { InformationItemRecord } from "@/lib/information/types";

type AnnouncementLikeInput = {
  title: string;
  body?: string | null;
  topics?: readonly string[] | null;
};

const pureAnnouncementPatterns = [
  /^关于.+(?:公告|公示|通告|提示|说明)$/u,
  /提示性公告|补充公告|更正公告|澄清公告|异动公告|进展公告|情况说明/u,
  /董事会决议|监事会决议|股东大会决议|临时股东大会/u,
  /问询函|回复函|监管函|关注函|工作函|告知函/u,
  /权益变动报告书|简式权益变动报告书|详式权益变动报告书/u,
  /招股说明书|募集说明书|上市公告书|回购报告书/u,
  /股份质押|解除质押|解除限售|股票交易异常波动|停牌核查/u,
  /(?:公告|报告书|说明书|决议公告)(?:（[^）]+）)?$/u,
];

const materialAnnouncementPatterns = [
  /并购|收购|出售|剥离|融资|募资|投资|增资|减资|上市|IPO|退市|回购|分红|财报|业绩|营收|利润|亏损|裁员|关店|开店|扩产|产能|供应链|关税|反垄断|罚款|处罚|禁令|AI|人工智能|芯片|半导体|云计算|电商|零售|消费|大模型/u,
  /\b(acquisition|acquire|merger|investment|funding|financing|ipo|listing|delist|buyback|dividend|earnings|revenue|profit|loss|layoffs?|capacity|supply chain|tariff|antitrust|penalty|ai|chip|semiconductor|cloud|retail|e-?commerce)\b/i,
];

function normalizeText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function isPureAnnouncementLike(input: AnnouncementLikeInput) {
  const title = normalizeText(input.title);

  if (!title) {
    return false;
  }

  const body = normalizeText(input.body);
  const topicsText = (input.topics ?? [])
    .map((topic) => normalizeText(topic))
    .filter(Boolean)
    .join(" ");
  const boilerplateText = normalizeText([title, topicsText].join(" "));

  if (!pureAnnouncementPatterns.some((pattern) => pattern.test(boilerplateText))) {
    return false;
  }

  const combined = normalizeText([title, body, topicsText].join(" "));

  return !materialAnnouncementPatterns.some((pattern) => pattern.test(combined));
}

export function filterDisplayableInformationItems(items: InformationItemRecord[]) {
  return items.filter(
    (item) =>
      !isPureAnnouncementLike({
        title: item.title,
        body: item.summary,
        topics: item.tags,
      })
  );
}
