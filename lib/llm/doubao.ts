import { z } from "zod";

export const DOUBAO_SEMANTIC_CHUNK_MODEL = "doubao-seed-2-0-pro-260215";
const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

const ChatResponseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().optional(),
        message: z.object({
          role: z.string().optional(),
          content: z.string().nullable().optional(),
        }),
      })
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

function normalizeBaseUrl(baseUrl?: string | null) {
  const normalized = (baseUrl || DEFAULT_ARK_BASE_URL).trim();

  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function getDoubaoApiKey() {
  return process.env.ARK_API_KEY?.trim() || process.env.DOUBAO_API_KEY?.trim();
}

function getDoubaoBaseUrl() {
  return normalizeBaseUrl(
    process.env.ARK_BASE_URL?.trim() || process.env.DOUBAO_BASE_URL?.trim()
  );
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

  return `Doubao Chat 请求失败，状态码 ${response.status}。`;
}

export async function createDoubaoChatCompletion(input: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const apiKey = getDoubaoApiKey();

  if (!apiKey) {
    throw new Error("未配置 ARK_API_KEY。请在 .env 中设置 Doubao/Ark API Key。");
  }

  const response = await fetch(`${getDoubaoBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      model: DOUBAO_SEMANTIC_CHUNK_MODEL,
      stream: false,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 4000,
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }

  const payload = ChatResponseSchema.parse(await response.json());
  const content = payload.choices[0]?.message.content?.trim();

  if (!content) {
    throw new Error("Doubao 返回为空，无法完成语义分块。");
  }

  return {
    content,
    model: payload.model ?? DOUBAO_SEMANTIC_CHUNK_MODEL,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    },
  };
}
