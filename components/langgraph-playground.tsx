"use client";

import { FormEvent, useState, useTransition } from "react";

type DemoIntent = "build" | "debug" | "research" | "general";

type DemoResponse = {
  threadId: string;
  intent: DemoIntent;
  focus: string;
  summary: string;
  notes: string[];
  turnCount: number;
  messageCount: number;
  messages: Array<{
    id?: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
  }>;
};

const starterPrompts = [
  "集成最新版 langgraph，需要 route handler、状态图和线程记忆。",
  "为什么 LangGraph 比普通链式流程更适合做 agent 编排？",
  "我在接 LangGraph 的时候报错了，帮我列一套排查路径。",
];

const intentLabels: Record<DemoIntent, string> = {
  build: "Build",
  debug: "Debug",
  research: "Research",
  general: "General",
};

function createThreadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `thread-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `thread-${Date.now().toString(36)}`;
}

export function LangGraphPlayground() {
  const [threadId, setThreadId] = useState("demo-thread");
  const [input, setInput] = useState(starterPrompts[0]);
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = input.trim().length > 0 && threadId.trim().length > 0;

  async function submitPrompt() {
    const response = await fetch("/api/langgraph", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        threadId,
        message: input,
      }),
    });

    const data = (await response.json()) as DemoResponse | { error?: string };

    if (!response.ok) {
      throw new Error(
        "error" in data && data.error ? data.error : "请求失败。"
      );
    }

    setResult(data as DemoResponse);
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setError(null);

    startTransition(() => {
      void submitPrompt().catch((submitError: unknown) => {
        setError(
          submitError instanceof Error ? submitError.message : "请求失败。"
        );
      });
    });
  }

  function handleNewThread() {
    setThreadId(createThreadId());
    setResult(null);
    setError(null);
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-black/10 bg-white/80 p-6 shadow-[0_20px_70px_rgba(13,38,59,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#0f766e] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white">
              LangGraph
            </span>
            <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-600">
              Next.js 16 Route Handler
            </span>
            <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-600">
              MemorySaver Thread State
            </span>
          </div>

          <div className="mt-6 space-y-4">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              最新版 LangGraph 已接入这个 Next.js 项目
            </h1>
            <p className="max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
              这个演示不依赖外部模型 Key，直接验证 LangGraph 的{" "}
              <span className="font-medium text-zinc-950">StateGraph、条件分支、Reducer 和 MemorySaver</span>
              都已经跑通。同一个 <code>threadId</code> 会复用会话状态。
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-700">
                Thread ID
              </span>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-900 outline-none ring-0 transition focus:border-[#0f766e]"
                  value={threadId}
                  onChange={(event) => setThreadId(event.target.value)}
                  placeholder="demo-thread"
                />
                <button
                  type="button"
                  className="rounded-2xl border border-black/10 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:border-black/20 hover:bg-black/[0.03]"
                  onClick={handleNewThread}
                >
                  新建 Thread
                </button>
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-700">
                Prompt
              </span>
              <textarea
                className="min-h-40 w-full rounded-[1.5rem] border border-black/10 bg-[#fffdf8] px-4 py-4 text-sm leading-7 text-zinc-900 outline-none transition focus:border-[#0f766e]"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入一段请求，观察 LangGraph 如何路由到不同分支。"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition hover:border-black/20 hover:text-zinc-950"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                disabled={!canSubmit || isPending}
              >
                {isPending ? "调用 LangGraph 中..." : "运行 Graph"}
              </button>
              <p className="text-sm text-zinc-500">
                同一个 <code>threadId</code> 连续提问，右侧会看到历史消息持续累计。
              </p>
            </div>
          </form>
        </div>

        <aside className="rounded-[2rem] border border-black/10 bg-[#10212d] p-6 text-white shadow-[0_18px_60px_rgba(10,32,53,0.18)] sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Graph State</h2>
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/70">
              {result ? intentLabels[result.intent] : "Idle"}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Focus
              </p>
              <p className="mt-2 text-sm leading-6 text-white/90">
                {result?.focus ?? "等待输入"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Summary
              </p>
              <p className="mt-2 text-sm leading-6 text-white/90">
                {result?.summary ?? "调用后会显示当前图的执行结论。"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                User Turns
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result?.turnCount ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Messages
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result?.messageCount ?? 0}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/55">
              Notes
            </p>
            <div className="mt-3 space-y-2">
              {result?.notes.length ? (
                result.notes.map((note) => (
                  <div
                    key={note}
                    className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 font-mono text-xs text-emerald-200"
                  >
                    {note}
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-white/65">
                  节点执行轨迹会在这里显示。
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_18px_60px_rgba(13,38,59,0.07)] backdrop-blur sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">
              Thread Messages
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              当前界面展示的是这个 thread 在 MemorySaver 里的完整消息历史。
            </p>
          </div>
          <div className="rounded-full border border-black/10 px-3 py-2 text-xs font-medium text-zinc-600">
            {result?.threadId ?? threadId}
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {result?.messages.length ? (
            result.messages.map((message, index) => (
              <article
                key={message.id ?? `${message.role}-${index}`}
                className={`rounded-[1.5rem] border px-4 py-4 sm:px-5 ${
                  message.role === "assistant"
                    ? "border-emerald-200 bg-emerald-50/80"
                    : "border-black/10 bg-zinc-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {message.role === "assistant" ? "Assistant" : "User"}
                  </span>
                  <span className="text-xs text-zinc-400">
                    #{index + 1}
                  </span>
                </div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-sans text-sm leading-7 text-zinc-800">
                  {message.content}
                </pre>
              </article>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-zinc-50 px-5 py-8 text-sm leading-7 text-zinc-500">
              还没有消息。提交一条请求后，这里会展示当前 thread 下的用户消息和 LangGraph 返回消息。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
