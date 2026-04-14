import { z } from "zod";

const DEFAULT_DASHSCOPE_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_BAILIAN_EMBEDDING_DIMENSIONS = 2048;
export const DEFAULT_BAILIAN_EMBEDDING_MODEL = "text-embedding-v4";

const EmbeddingsResponseSchema = z.object({
  model: z.string().optional(),
  data: z
    .array(
      z.object({
        index: z.number().int().optional(),
        embedding: z.array(z.number()),
      })
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

function normalizeBaseUrl(baseUrl?: string | null) {
  const normalized = (baseUrl || DEFAULT_DASHSCOPE_BASE_URL).trim();

  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function getDashScopeApiKey() {
  return process.env.DASHSCOPE_API_KEY?.trim();
}

function getDashScopeBaseUrl() {
  return normalizeBaseUrl(process.env.DASHSCOPE_BASE_URL?.trim());
}

function readEmbeddingModel() {
  return (
    process.env.DASHSCOPE_EMBEDDING_MODEL?.trim() ||
    DEFAULT_BAILIAN_EMBEDDING_MODEL
  );
}

export function getBailianEmbeddingDimensions() {
  const configured = process.env.DASHSCOPE_EMBEDDING_DIMENSIONS?.trim();

  if (!configured) {
    return DEFAULT_BAILIAN_EMBEDDING_DIMENSIONS;
  }

  const dimensions = Number(configured);

  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("DASHSCOPE_EMBEDDING_DIMENSIONS 必须是正整数。");
  }

  return dimensions;
}

async function readProviderError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string } | string;
      message?: string;
      code?: string;
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

    if (typeof payload.code === "string") {
      return payload.code;
    }
  } catch {
    const text = await response.text();

    if (text.trim()) {
      return text;
    }
  }

  return `百炼 Embeddings 请求失败，状态码 ${response.status}。`;
}

export async function createBailianEmbeddings(input: { texts: string[] }) {
  if (!input.texts.length) {
    throw new Error("texts 不能为空。");
  }

  const apiKey = getDashScopeApiKey();

  if (!apiKey) {
    throw new Error(
      "未配置 DASHSCOPE_API_KEY。请在 .env 中设置阿里云百炼 API Key。"
    );
  }

  const dimensions = getBailianEmbeddingDimensions();
  const model = readEmbeddingModel();
  const response = await fetch(`${getDashScopeBaseUrl()}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      model,
      input: input.texts,
      dimensions,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }

  const payload = EmbeddingsResponseSchema.parse(await response.json());
  const vectors = [...payload.data]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => item.embedding);

  if (vectors.length !== input.texts.length) {
    throw new Error("百炼 Embeddings 返回数量与输入数量不一致。");
  }

  const vectorDimensions = vectors[0]?.length ?? 0;

  if (!vectorDimensions) {
    throw new Error("百炼 Embeddings 返回为空向量。");
  }

  if (vectors.some((vector) => vector.length !== vectorDimensions)) {
    throw new Error("百炼 Embeddings 返回的向量维度不一致。");
  }

  return {
    model: payload.model ?? model,
    requestedModel: model,
    dimensions: vectorDimensions,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    },
    vectors,
  };
}
