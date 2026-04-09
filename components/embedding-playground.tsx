"use client";

import { FormEvent, useState, useTransition } from "react";

type EmbeddingResponse = {
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

const sampleTexts = [
  "Silicon flow embedding online: fast, affordable, and high-quality embedding services. come try it out!",
  "把这段中文文本转成 embedding，后续可以接入检索、相似度召回和 RAG。",
];

export function EmbeddingPlayground() {
  const [input, setInput] = useState(sampleTexts[0]);
  const [result, setResult] = useState<EmbeddingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = input.trim().length > 0;

  async function submitEmbedding() {
    const response = await fetch("/api/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input,
      }),
    });

    const data = (await response.json()) as EmbeddingResponse | { error?: string };

    if (!response.ok) {
      throw new Error(
        "error" in data && data.error ? data.error : "Embedding 请求失败。"
      );
    }

    setResult(data as EmbeddingResponse);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setError(null);

    startTransition(() => {
      void submitEmbedding().catch((submitError: unknown) => {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Embedding 请求失败。"
        );
      });
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-10 sm:px-10 lg:px-12 lg:pt-14">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.92fr]">
        <div className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_20px_70px_rgba(13,38,59,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#0b5bd3] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white">
              Embeddings
            </span>
            <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-600">
              SiliconFlow API
            </span>
            <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-600">
              Server-side Fetch
            </span>
          </div>

          <div className="mt-6 space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              已接入 SiliconFlow embedding 能力
            </h1>
            <p className="max-w-3xl text-base leading-7 text-zinc-600 sm:text-lg">
              通过服务端 Route Handler 调用{" "}
              <span className="font-medium text-zinc-950">
                `https://api.siliconflow.cn/v1/embeddings`
              </span>
              ，token 和模型都不再由页面输入，统一由服务端环境变量{" "}
              <code>SILICONFLOW_API_KEY</code> 和{" "}
              <code>SILICONFLOW_EMBEDDING_MODEL</code> 提供。
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-700">Input</span>
              <textarea
                className="min-h-36 w-full rounded-[1.5rem] border border-black/10 bg-[#f8fbff] px-4 py-4 text-sm leading-7 text-zinc-900 outline-none transition focus:border-[#0b5bd3]"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入要转换为向量的文本"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {sampleTexts.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition hover:border-black/20 hover:text-zinc-950"
                  onClick={() => setInput(sample)}
                >
                  使用示例文本
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="rounded-full bg-[#0b5bd3] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#0a4fb8] disabled:cursor-not-allowed disabled:bg-zinc-400"
                disabled={!canSubmit || isPending}
              >
                {isPending ? "生成 embedding 中..." : "生成 Embedding"}
              </button>
              <p className="text-sm text-zinc-500">
                路由会直接读取服务端环境变量 `SILICONFLOW_API_KEY` 和
                `SILICONFLOW_EMBEDDING_MODEL`。
              </p>
            </div>
          </form>
        </div>

        <aside className="rounded-[2rem] border border-black/10 bg-[#0f172a] p-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.18)] sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Embedding Result</h2>
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/70">
              {result ? "Ready" : "Idle"}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Model
              </p>
              <p className="mt-2 text-sm leading-6 text-white/90">
                {result?.model ?? "等待调用"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Dimensions
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result?.dimensions ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Prompt Tokens
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result?.usage?.promptTokens ?? "-"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Total Tokens
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result?.usage?.totalTokens ?? "-"}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/55">
              Input Preview
            </p>
            <p className="mt-3 text-sm leading-7 text-white/90">
              {result?.inputPreview ?? "成功调用后，这里会显示截断后的输入预览。"}
            </p>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/55">
              Vector Preview
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl border border-white/8 bg-white/5 p-4 font-mono text-xs leading-6 text-cyan-200">
              {result
                ? JSON.stringify(result.preview, null, 2)
                : "调用后会显示 embedding 前 12 维。"}
            </pre>
          </div>
        </aside>
      </div>

      <div className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_18px_60px_rgba(13,38,59,0.07)] backdrop-blur sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">
              Full Vector
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              这里直接展示完整 embedding，便于你后续接相似度检索、向量库或 RAG。
            </p>
          </div>
          <div className="rounded-full border border-black/10 px-3 py-2 text-xs font-medium text-zinc-600">
            {result ? `${result.dimensions} dims` : "暂无结果"}
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <pre className="mt-6 max-h-[26rem] overflow-auto rounded-[1.5rem] border border-black/10 bg-[#f6f8fb] p-5 font-mono text-xs leading-6 text-zinc-800">
          {result
            ? JSON.stringify(result.embedding, null, 2)
            : "生成后会在这里看到完整向量数组。"}
        </pre>
      </div>
    </section>
  );
}
