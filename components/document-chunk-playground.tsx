"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

type ChunkResponse = {
  fileName: string;
  fileType: "doc" | "docx";
  parser: "mammoth" | "word-extractor";
  model: string;
  extractedTextLength: number;
  extractedTextPreview: string;
  unitCount: number;
  chunkCount: number;
  usage: {
    requestCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  chunks: Array<{
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
  }>;
};

const breakReasonLabels: Record<ChunkResponse["chunks"][number]["breakReason"], string> =
  {
    start: "起始块",
    semantic_break: "语义切分",
    heading_break: "标题切分",
  };

const loadingSteps = [
  "正在上传文档",
  "正在提取正文内容",
  "正在调用 Doubao 分析主题边界",
  "正在整理分块结果",
];

export function DocumentChunkPlayground() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ChunkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  const canSubmit = useMemo(() => Boolean(file), [file]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingStepIndex((current) =>
        current < loadingSteps.length - 1 ? current + 1 : current
      );
    }, 1400);

    return () => window.clearInterval(timer);
  }, [isLoading]);

  async function submitFile() {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch("/api/document-chunks", {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as ChunkResponse | { error?: string };

    if (!response.ok) {
      throw new Error("error" in data && data.error ? data.error : "上传失败。");
    }

    setResult(data as ChunkResponse);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setError(null);
    setLoadingStepIndex(0);
    setIsLoading(true);

    startTransition(() => {
      void submitFile()
        .catch((submitError: unknown) => {
          setError(
            submitError instanceof Error ? submitError.message : "上传失败。"
          );
        })
        .finally(() => {
          setLoadingStepIndex(0);
          setIsLoading(false);
        });
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
      <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_20px_70px_rgba(13,38,59,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#155eef] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white">
              Semantic Chunking
            </span>
            <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-600">
              DOC / DOCX Upload
            </span>
            <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-600">
              Doubao Seed 2.0 Pro
            </span>
          </div>

          <div className="mt-6 space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              上传 Word 文档并按语义分块
            </h1>
            <p className="max-w-3xl text-base leading-7 text-zinc-600 sm:text-lg">
              页面支持上传 <code>.doc</code> 和 <code>.docx</code>。
              服务端会先抽取正文，再调用大模型{" "}
              <code>doubao-seed-2-0-pro-260215</code> 直接判断主题边界。
              分块依据是观点、章节、论证目标是否变化，而不是向量相似度或固定长度。
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-3">
              <span className="text-sm font-medium text-zinc-700">
                Word 文件
              </span>
              <div className="rounded-[1.75rem] border border-dashed border-[#155eef]/35 bg-[#f3f7ff] p-5">
                <input
                  type="file"
                  accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                  className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#155eef] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#104fca]"
                />
                <p className="mt-3 text-sm leading-6 text-zinc-500">
                  推荐上传结构比较清晰的文档。当前限制 10MB，解析器会使用
                  `mammoth` 处理 `docx`、`word-extractor` 处理 `doc`，随后交给
                  Doubao 模型做语义分段。
                </p>
              </div>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                disabled={!canSubmit || isPending || isLoading}
              >
                {isLoading ? loadingSteps[loadingStepIndex] : "上传并语义分块"}
              </button>
              <p className="text-sm text-zinc-500">
                {file
                  ? `已选择：${file.name}`
                  : "请选择一个 .doc 或 .docx 文档。"}
              </p>
            </div>
          </form>

          {isLoading ? (
            <div className="mt-6 rounded-[1.5rem] border border-[#155eef]/15 bg-[#f5f8ff] p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-3 w-3 rounded-full bg-[#155eef] animate-pulse" />
                <p className="text-sm font-medium text-zinc-900">
                  {loadingSteps[loadingStepIndex]}
                </p>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {loadingSteps.map((step, index) => {
                  const isDone = index < loadingStepIndex;
                  const isCurrent = index === loadingStepIndex;

                  return (
                    <div
                      key={step}
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isCurrent
                          ? "border-[#155eef]/35 bg-white text-zinc-950"
                          : isDone
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-black/8 bg-white/70 text-zinc-500"
                      }`}
                    >
                      {step}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-[2rem] border border-black/10 bg-[#10212d] p-6 text-white shadow-[0_18px_60px_rgba(10,32,53,0.18)] sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Chunk Summary</h2>
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/70">
              {isLoading ? "Processing" : result ? "Ready" : "Idle"}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                File
              </p>
              <p className="mt-2 text-sm leading-6 text-white/90">
                {result?.fileName ?? "等待上传"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Parser
              </p>
              <p className="mt-2 text-sm leading-6 text-white/90">
                {result?.parser ?? "等待上传"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Units
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result?.unitCount ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Chunks
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result?.chunkCount ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Model
              </p>
              <p className="mt-2 text-sm leading-6 text-white/90">
                {result?.model ?? "等待上传"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                Requests
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result?.usage.requestCount ?? 0}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/55">
              Model Usage
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-3">
                <p className="text-xs text-white/55">Prompt Tokens</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {result?.usage.promptTokens ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-3">
                <p className="text-xs text-white/55">Completion Tokens</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {result?.usage.completionTokens ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-3">
                <p className="text-xs text-white/55">Total Tokens</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {result?.usage.totalTokens ?? 0}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_18px_60px_rgba(13,38,59,0.07)] backdrop-blur sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">
              Chunk Results
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              每个块都展示行号范围、核心观点、标签、关键词、切分原因和正文内容。
            </p>
          </div>
          <div className="rounded-full border border-black/10 px-3 py-2 text-xs font-medium text-zinc-600">
            {result ? `${result.extractedTextLength} chars extracted` : "暂无结果"}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {result?.chunks.length ? (
            result.chunks.map((chunk) => (
              <article
                key={`${chunk.index}-${chunk.startUnit}-${chunk.endUnit}`}
                className="rounded-[1.5rem] border border-black/10 bg-[#fbfcfe] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#155eef] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                      Chunk {chunk.index + 1}
                    </span>
                    <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-600">
                      {breakReasonLabels[chunk.breakReason]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>{chunk.charCount} chars</span>
                    <span>{chunk.unitCount} units</span>
                    <span>
                      units {chunk.startUnit + 1}-{chunk.endUnit + 1}
                    </span>
                    <span>
                      lines {chunk.startLine}-{chunk.endLine}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 rounded-2xl border border-black/8 bg-white p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      标题
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-900">
                      {chunk.title}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      切分原因
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-700">
                      {chunk.reason}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-[#155eef]/15 bg-[#f6f9ff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    核心观点
                  </p>
                  <p className="mt-2 text-sm leading-7 text-zinc-900">
                    {chunk.coreViewpoint}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-black/8 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      标签
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {chunk.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-black/8 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      关键词
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {chunk.keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-medium text-[#155eef]"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-black/8 bg-white p-4 font-sans text-sm leading-7 text-zinc-800">
                  {chunk.content}
                </pre>
              </article>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-zinc-50 px-5 py-8 text-sm leading-7 text-zinc-500">
              上传文档后，这里会展示语义分块结果。
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_18px_60px_rgba(13,38,59,0.07)] backdrop-blur sm:p-8">
        <h2 className="text-xl font-semibold text-zinc-950">
          Extracted Text Preview
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          这里展示解析后的前 500 个字符，便于判断提取质量。
        </p>
        <pre className="mt-6 max-h-72 overflow-auto rounded-[1.5rem] border border-black/10 bg-[#f6f8fb] p-5 font-sans text-sm leading-7 text-zinc-800">
          {result?.extractedTextPreview ??
            "上传文档后，这里会显示抽取出的正文预览。"}
        </pre>
      </div>
    </section>
  );
}
