import {
  createSiliconFlowEmbedding,
  getSiliconFlowEmbeddingModel,
} from "@/lib/embeddings/siliconflow";
import { z } from "zod";

const RequestSchema = z.object({
  input: z
    .string()
    .trim()
    .min(1, "input 不能为空。")
    .max(8000, "input 不能超过 8000 个字符。"),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是合法 JSON。" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "请求参数不合法。" },
      { status: 400 }
    );
  }

  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();

  if (!apiKey) {
    return Response.json(
      {
        error: "未配置 SiliconFlow API Key。请设置 SILICONFLOW_API_KEY。",
      },
      { status: 400 }
    );
  }

  try {
    const result = await createSiliconFlowEmbedding({
      text: parsed.data.input,
      model: getSiliconFlowEmbeddingModel(),
      apiKey,
    });

    return Response.json(result);
  } catch (error) {
    console.error("SiliconFlow embedding invocation failed", error);

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Embedding 调用失败。",
      },
      { status: 502 }
    );
  }
}
