import {
  DOUBAO_SEMANTIC_CHUNK_MODEL,
  createDoubaoChatCompletion,
} from "@/lib/llm/doubao";
import { z } from "zod";

type TextUnit = {
  index: number;
  text: string;
  charCount: number;
  kind: "heading" | "body";
  startLine: number;
  endLine: number;
};

export type SemanticChunk = {
  index: number;
  title: string;
  reason: string;
  coreViewpoint: string;
  tags: string[];
  keywords: string[];
  content: string;
  charCount: number;
  unitCount: number;
  startUnit: number;
  endUnit: number;
  startLine: number;
  endLine: number;
  breakReason: "start" | "semantic_break" | "heading_break";
  preview: string;
};

export type SemanticChunkingResult = {
  model: string;
  unitCount: number;
  chunkCount: number;
  usage: {
    requestCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  chunks: SemanticChunk[];
};

function normalizeInlineWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function splitIntoSentences(paragraph: string) {
  const matches = paragraph.match(/[^。！？!?；;：:\n]+[。！？!?；;：:]?/g);

  if (!matches) {
    return [paragraph];
  }

  return matches.map((part) => normalizeInlineWhitespace(part)).filter(Boolean);
}

function looksLikeHeading(text: string) {
  return (
    text.length <= 60 &&
    /^(\d+(\.\d+)*|[一二三四五六七八九十]+[、.．]|第[一二三四五六七八九十\d]+[章节部分]|[（(]?[一二三四五六七八九十\d]+[)）][、.．]?)/.test(
      text
    )
  );
}

type ParagraphBlock = {
  text: string;
  startLine: number;
  endLine: number;
};

function splitIntoParagraphs(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const paragraphs: ParagraphBlock[] = [];
  let currentLines: string[] = [];
  let startLine = 1;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (!line) {
      if (currentLines.length) {
        paragraphs.push({
          text: currentLines.join(" "),
          startLine,
          endLine: lineNumber - 1,
        });
        currentLines = [];
      }

      return;
    }

    if (!currentLines.length) {
      startLine = lineNumber;
    }

    currentLines.push(line);
  });

  if (currentLines.length) {
    paragraphs.push({
      text: currentLines.join(" "),
      startLine,
      endLine: lines.length,
    });
  }

  return paragraphs;
}

function buildTextUnits(text: string) {
  const paragraphs = splitIntoParagraphs(text)
    .map((paragraph) => ({
      ...paragraph,
      text: normalizeInlineWhitespace(paragraph.text),
    }))
    .filter((paragraph) => Boolean(paragraph.text));

  const units: TextUnit[] = [];
  const maxUnitChars = 520;

  for (const paragraph of paragraphs) {
    const paragraphKind: TextUnit["kind"] = looksLikeHeading(paragraph.text)
      ? "heading"
      : "body";

    if (paragraph.text.length <= maxUnitChars) {
      units.push({
        index: units.length,
        text: paragraph.text,
        charCount: paragraph.text.length,
        kind: paragraphKind,
        startLine: paragraph.startLine,
        endLine: paragraph.endLine,
      });
      continue;
    }

    const sentences = splitIntoSentences(paragraph.text);
    let current = "";

    for (const sentence of sentences) {
      const candidate = current ? `${current} ${sentence}` : sentence;

      if (candidate.length <= maxUnitChars) {
        current = candidate;
        continue;
      }

      if (current) {
        units.push({
          index: units.length,
          text: current,
          charCount: current.length,
          kind: paragraphKind,
          startLine: paragraph.startLine,
          endLine: paragraph.endLine,
        });
      }

      current = sentence;
    }

    if (current) {
      units.push({
        index: units.length,
        text: current,
        charCount: current.length,
        kind: paragraphKind,
        startLine: paragraph.startLine,
        endLine: paragraph.endLine,
      });
    }
  }

  const merged: TextUnit[] = [];

  for (const unit of units) {
    const previous = merged.at(-1);
    const isShortFragment = unit.charCount < 24;
    const endsLikeCompleteSentence = /[。！？.!?；;：:]$/.test(unit.text);
    const canMergeIntoPrevious =
      previous &&
      isShortFragment &&
      unit.kind !== "heading" &&
      !endsLikeCompleteSentence;

    if (canMergeIntoPrevious) {
      previous.text = `${previous.text} ${unit.text}`;
      previous.charCount = previous.text.length;
      previous.endLine = unit.endLine;
      continue;
    }

    merged.push({
      index: merged.length,
      text: unit.text,
      charCount: unit.charCount,
      kind: unit.kind,
      startLine: unit.startLine,
      endLine: unit.endLine,
    });
  }

  return merged;
}

function shorten(text: string, maxLength = 120) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

const ChunkPlanSchema = z.object({
  chunks: z
    .array(
      z.object({
        startUnit: z.number().int().positive(),
        endUnit: z.number().int().positive(),
        title: z.string().trim().min(1),
        reason: z.string().trim().min(1),
        coreViewpoint: z.string().trim().min(1),
        tags: z.array(z.string().trim().min(1)).min(1).max(6),
        keywords: z.array(z.string().trim().min(1)).min(2).max(8),
      })
    )
    .min(1),
});

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Doubao 未返回可解析的 JSON 结果。");
  }

  return text.slice(firstBrace, lastBrace + 1);
}

function formatUnitsForPrompt(units: TextUnit[]) {
  return units
    .map(
      (unit) =>
        `[${unit.index + 1}][${unit.kind === "heading" ? "H" : "B"}][L${unit.startLine}-${unit.endLine}] ${unit.text}`
    )
    .join("\n");
}

function normalizeChunkPlan(
  plan: z.infer<typeof ChunkPlanSchema>,
  unitCount: number
) {
  const rawChunks = [...plan.chunks].sort((left, right) => {
    if (left.startUnit !== right.startUnit) {
      return left.startUnit - right.startUnit;
    }

    return left.endUnit - right.endUnit;
  });

  const normalized: z.infer<typeof ChunkPlanSchema>["chunks"] = [];
  let cursor = 1;

  for (const rawChunk of rawChunks) {
    const startUnit = Math.max(cursor, Math.min(rawChunk.startUnit, unitCount));
    const endUnit = Math.max(startUnit, Math.min(rawChunk.endUnit, unitCount));

    if (startUnit > cursor) {
      normalized.push({
        startUnit: cursor,
        endUnit: startUnit - 1,
        title: "延续上文主题",
        reason: "模型返回的范围存在空洞，已自动补齐连续区间。",
        coreViewpoint: "这一段内容延续前文主题，没有形成新的独立观点。",
        tags: ["主题延续"],
        keywords: ["延续", "补齐"],
      });
    }

    normalized.push({
      startUnit,
      endUnit,
      title: rawChunk.title,
      reason: rawChunk.reason,
      coreViewpoint: rawChunk.coreViewpoint,
      tags: rawChunk.tags,
      keywords: rawChunk.keywords,
    });

    cursor = endUnit + 1;

    if (cursor > unitCount) {
      break;
    }
  }

  if (cursor <= unitCount) {
    normalized.push({
      startUnit: cursor,
      endUnit: unitCount,
      title: "文档剩余内容",
      reason: "模型输出未覆盖尾部区间，已自动补齐。",
      coreViewpoint: "文档尾部内容被保留为独立语义块。",
      tags: ["尾部补齐"],
      keywords: ["尾部", "补齐"],
    });
  }

  const merged: typeof normalized = [];

  for (const chunk of normalized) {
    const previous = merged.at(-1);

    if (previous && chunk.startUnit <= previous.endUnit) {
      previous.endUnit = Math.max(previous.endUnit, chunk.endUnit);
      continue;
    }

    merged.push({ ...chunk });
  }

  if (!merged.length) {
    return [
      {
        startUnit: 1,
        endUnit: unitCount,
        title: "完整文档",
        reason: "模型未返回有效边界，保留整篇内容。",
        coreViewpoint: "模型未识别到可靠边界，暂时保留完整文档。",
        tags: ["完整文档"],
        keywords: ["整体", "未切分"],
      },
    ];
  }

  merged[0]!.startUnit = 1;
  merged[merged.length - 1]!.endUnit = unitCount;

  return merged;
}

async function requestChunkPlan(units: TextUnit[], retry = false) {
  const systemPrompt = [
    "你是一个中文文档语义切分专家。",
    "你的任务是把一组按顺序排列的文档单元，切成若干个语义块。",
    "每个语义块必须只围绕一个独立主题、观点、论点、步骤或小节。",
    "重要：不要因为内容很长就切分；如果一大段内容一直在围绕同一个观点展开，即使很长也必须保留在同一个块里。",
    "只有在主题、观点、论证目标、讨论对象或章节发生明显变化时才切分。",
    "标题、章节名、小节名通常应该成为新块的起点。",
    "你还必须为每个块提炼一个核心观点，要求是清晰、直接、可判断的中文陈述句，例如“管理层一定要深入一线”。",
    "同时为每个块提炼标签和关键词。标签偏主题分类，关键词偏内容抓手。",
    "输出必须是 JSON，且只能输出 JSON，不要带解释、不要带 Markdown 代码块。",
  ].join("\n");

  const userPrompt = [
    retry
      ? "上一次切分过于保守。请更积极识别独立观点或章节边界，但仍然不要按长度切分。"
      : "请对以下文档单元进行语义切分。",
    "规则：",
    "1. 所有块必须按原顺序覆盖全部单元。",
    "2. 块必须由连续单元组成，不能跳号。",
    "3. 如果多个连续单元在论证同一件事，即使很长也不能拆开。",
    "4. 如果进入新标题、新观点、新问题、新方案、新步骤，就应开始新块。",
    "5. coreViewpoint 必须是一个核心观点句，不要写成摘要短语。",
    "6. tags 建议 2-4 个，keywords 建议 3-6 个。",
    "7. 期望输出格式：",
    '{"chunks":[{"startUnit":1,"endUnit":3,"title":"块标题","reason":"为什么从这里切","coreViewpoint":"核心观点句","tags":["标签1","标签2"],"keywords":["关键词1","关键词2","关键词3"]}]}',
    "单元列表如下：",
    formatUnitsForPrompt(units),
  ].join("\n\n");

  const response = await createDoubaoChatCompletion({
    systemPrompt,
    userPrompt,
    temperature: 0.1,
    maxTokens: 5000,
  });
  const jsonText = extractJsonObject(response.content);
  const parsed = ChunkPlanSchema.parse(JSON.parse(jsonText));

  return {
    model: response.model,
    usage: response.usage,
    chunks: normalizeChunkPlan(parsed, units.length),
  };
}

export async function createSemanticChunks(text: string) {
  const units = buildTextUnits(text);

  if (!units.length) {
    throw new Error("文档中没有可用于分块的正文内容。");
  }

  const firstAttempt = await requestChunkPlan(units, false);
  const finalPlan =
    firstAttempt.chunks.length === 1 && units.length >= 6
      ? await requestChunkPlan(units, true)
      : firstAttempt;
  const chunks: SemanticChunk[] = finalPlan.chunks.map((chunk, index) => {
    const startIndex = chunk.startUnit - 1;
    const endIndex = chunk.endUnit - 1;
    const unitSlice = units.slice(startIndex, endIndex + 1);
    const content = unitSlice.map((unit) => unit.text).join("\n\n");
    const startsWithHeading = unitSlice[0]?.kind === "heading";
    const startLine = unitSlice[0]?.startLine ?? 1;
    const endLine = unitSlice.at(-1)?.endLine ?? startLine;

    return {
      index,
      title: chunk.title,
      reason: chunk.reason,
      coreViewpoint: chunk.coreViewpoint,
      tags: chunk.tags,
      keywords: chunk.keywords,
      content,
      charCount: content.length,
      unitCount: unitSlice.length,
      startUnit: startIndex,
      endUnit: endIndex,
      startLine,
      endLine,
      breakReason: index === 0 ? "start" : startsWithHeading ? "heading_break" : "semantic_break",
      preview: shorten(content),
    };
  });

  return {
    model: finalPlan.model || DOUBAO_SEMANTIC_CHUNK_MODEL,
    unitCount: units.length,
    chunkCount: chunks.length,
    usage: {
      requestCount: finalPlan === firstAttempt ? 1 : 2,
      promptTokens:
        firstAttempt.usage.promptTokens +
        (finalPlan === firstAttempt ? 0 : finalPlan.usage.promptTokens),
      completionTokens:
        firstAttempt.usage.completionTokens +
        (finalPlan === firstAttempt ? 0 : finalPlan.usage.completionTokens),
      totalTokens:
        firstAttempt.usage.totalTokens +
        (finalPlan === firstAttempt ? 0 : finalPlan.usage.totalTokens),
    },
    chunks,
  } satisfies SemanticChunkingResult;
}
