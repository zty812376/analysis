import { z } from "zod";

export const DEFAULT_SILICONFLOW_EMBEDDING_MODEL = "BAAI/bge-large-zh-v1.5";

const SiliconFlowEmbeddingsResponseSchema = z.object({
  object: z.string().optional(),
  model: z.string(),
  data: z
    .array(
      z.object({
        object: z.string().optional(),
        embedding: z.array(z.number()),
        index: z.number().int().nonnegative().optional(),
      })
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .passthrough()
    .optional(),
});

export type SiliconFlowEmbeddingResult = {
  provider: "siliconflow";
  model: string;
  inputPreview: string;
  dimensions: number;
  embedding: number[];
  preview: number[];
  usage?: {
    promptTokens?: number;
    totalTokens?: number;
  };
};

function normalizeApiKey(apiKey?: string | null) {
  const trimmed = apiKey?.trim();

  return trimmed ? trimmed : undefined;
}

export function getSiliconFlowEmbeddingModel(model?: string | null) {
  const trimmed = model?.trim();

  if (trimmed) {
    return trimmed;
  }

  return (
    process.env.SILICONFLOW_EMBEDDING_MODEL?.trim() ||
    DEFAULT_SILICONFLOW_EMBEDDING_MODEL
  );
}

function shorten(text: string, maxLength = 80) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

async function readProviderError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string } | string;
      message?: string;
    };

    if (typeof payload.error === "string") {
      return payload.error;
    }

    if (payload.error && typeof payload.error.message === "string") {
      return payload.error.message;
    }

    if (typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    const text = await response.text();

    if (text.trim()) {
      return text;
    }
  }

  return `SiliconFlow embeddings 请求失败，状态码 ${response.status}。`;
}

export async function createSiliconFlowEmbedding(input: {
  text: string;
  model?: string;
  apiKey?: string;
}): Promise<SiliconFlowEmbeddingResult> {
  const apiKey =
    normalizeApiKey(input.apiKey) ??
    normalizeApiKey(process.env.SILICONFLOW_API_KEY);

  if (!apiKey) {
    throw new Error(
      "未配置 SiliconFlow API Key。请设置 SILICONFLOW_API_KEY。"
    );
  }

  const model = getSiliconFlowEmbeddingModel(input.model);
  const response = await fetch("https://api.siliconflow.cn/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      model,
      input: input.text,
    }),
  });

  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }

  const payload = SiliconFlowEmbeddingsResponseSchema.parse(
    await response.json()
  );
  const embedding = payload.data[0]?.embedding ?? [];

  return {
    provider: "siliconflow",
    model: payload.model,
    inputPreview: shorten(input.text, 120),
    dimensions: embedding.length,
    embedding,
    preview: embedding.slice(0, 12),
    usage: payload.usage
      ? {
          promptTokens: payload.usage.prompt_tokens,
          totalTokens: payload.usage.total_tokens,
        }
      : undefined,
  };
}
