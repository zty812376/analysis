import type { InformationFeedSource } from "@/lib/information/sources";

export type CollectedFeedItem = {
  feedKey: string;
  feedLabel: string;
  title: string;
  description: string;
  topics: string[];
  sourceName: string;
  sourceDomain: string;
  sourceUrl: string;
  author: string | null;
  publishedAt: string;
};

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeNamedEntity(entity: string) {
  switch (entity) {
    case "amp":
      return "&";
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "quot":
      return '"';
    case "apos":
      return "'";
    case "nbsp":
      return " ";
    case "ndash":
      return "-";
    case "mdash":
      return "-";
    case "hellip":
      return "...";
    case "rsquo":
    case "lsquo":
      return "'";
    case "rdquo":
    case "ldquo":
      return '"';
    default:
      return `&${entity};`;
  }
}

function decodeXmlEntities(text: string) {
  return text.replace(
    /&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp|ndash|mdash|hellip|rsquo|lsquo|rdquo|ldquo);/g,
    (_, entity: string) => {
      if (entity.startsWith("#x")) {
        const codePoint = Number.parseInt(entity.slice(2), 16);

        return Number.isNaN(codePoint)
          ? `&${entity};`
          : String.fromCodePoint(codePoint);
      }

      if (entity.startsWith("#")) {
        const codePoint = Number.parseInt(entity.slice(1), 10);

        return Number.isNaN(codePoint)
          ? `&${entity};`
          : String.fromCodePoint(codePoint);
      }

      return decodeNamedEntity(entity);
    }
  );
}

function stripHtmlTags(text: string) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function readTag(block: string, tagName: string) {
  const pattern = new RegExp(
    `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "i"
  );
  const match = block.match(pattern);

  if (!match) {
    return "";
  }

  return stripCdata(match[1] ?? "");
}

function readTags(block: string, tagName: string) {
  const pattern = new RegExp(
    `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "gi"
  );

  return Array.from(block.matchAll(pattern))
    .map((match) => normalizeText(decodeXmlEntities(stripCdata(match[1] ?? ""))))
    .filter(Boolean);
}

function parseDescription(rawDescription: string) {
  const decoded = decodeXmlEntities(rawDescription);

  return normalizeText(stripHtmlTags(decoded));
}

function toSourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseRssItems(xml: string, source: InformationFeedSource) {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];

  return itemBlocks
    .map<CollectedFeedItem | null>((itemBlock) => {
      const title = normalizeText(decodeXmlEntities(readTag(itemBlock, "title")));
      const link = normalizeText(decodeXmlEntities(readTag(itemBlock, "link")));
      const description = parseDescription(readTag(itemBlock, "description"));
      const topics = readTags(itemBlock, "category");
      const author = normalizeText(
        decodeXmlEntities(readTag(itemBlock, "dc:creator"))
      );
      const pubDate = normalizeText(readTag(itemBlock, "pubDate"));
      const parsedDate = new Date(pubDate);

      if (!title || !link || Number.isNaN(parsedDate.getTime())) {
        return null;
      }

      return {
        feedKey: source.key,
        feedLabel: source.label,
        title,
        description,
        topics,
        sourceName: source.label,
        sourceDomain: toSourceDomain(link),
        sourceUrl: link,
        author: author || null,
        publishedAt: parsedDate.toISOString(),
      };
    })
    .filter((item): item is CollectedFeedItem => Boolean(item));
}

export async function fetchRssFeed(source: InformationFeedSource) {
  let response: Response;

  try {
    response = await fetch(source.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent": "analysis-information-bot/1.0",
        Accept:
          "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${source.label} 抓取失败：${error.message}`);
    }

    throw new Error(`${source.label} 抓取失败。`);
  }

  if (!response.ok) {
    throw new Error(`${source.label} 抓取失败，状态码 ${response.status}。`);
  }

  const xml = await response.text();

  return parseRssItems(xml, source);
}
