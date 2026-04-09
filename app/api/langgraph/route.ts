import { runLangGraphDemo } from "@/lib/langgraph/demo-graph";
import { z } from "zod";

const RequestSchema = z.object({
  threadId: z
    .string()
    .trim()
    .min(1, "threadId 不能为空。")
    .max(80, "threadId 不能超过 80 个字符。")
    .regex(/^[a-zA-Z0-9_-]+$/, "threadId 只能包含字母、数字、下划线和短横线。")
    .optional(),
  message: z
    .string()
    .trim()
    .min(1, "消息不能为空。")
    .max(2000, "消息不能超过 2000 个字符。"),
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

  const threadId =
    parsed.data.threadId ?? `thread-${crypto.randomUUID().slice(0, 8)}`;

  try {
    const result = await runLangGraphDemo({
      threadId,
      message: parsed.data.message,
    });

    return Response.json(result);
  } catch (error) {
    console.error("LangGraph demo invocation failed", error);

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "LangGraph 调用失败。",
      },
      { status: 500 }
    );
  }
}
