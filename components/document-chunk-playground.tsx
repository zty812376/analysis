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
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="border-y border-[var(--rule)] py-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl leading-[0.96] tracking-[-0.04em] text-zinc-950 sm:text-5xl lg:text-6xl">
              文稿语义
              <br />
              结构拆解
            </h1>
          </div>
          <div className="max-w-xs border-l border-[var(--rule)] pl-4 text-[0.92rem] leading-6 text-[var(--ink-soft)]">
            上传一份 Word 文档，提炼章节边界、核心观点、标签与关键词，并用更有层次的方式展示结果。
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.16fr)_292px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-[var(--rule)] bg-[rgba(251,246,238,0.92)] shadow-[0_24px_60px_rgba(60,38,24,0.07)]">
            <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[1.16fr_0.84fr] lg:px-8 lg:py-7">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-white">
                    语义分块
                  </span>
                  <span className="rounded-full border border-[var(--rule)] px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    DOC / DOCX
                  </span>
                  <span className="rounded-full border border-[var(--rule)] px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    Doubao Seed 2.0 Pro
                  </span>
                </div>

                <h2 className="mt-4 max-w-3xl font-serif text-[2rem] leading-[0.98] tracking-[-0.04em] text-zinc-950 sm:text-[2.55rem] lg:text-[3.2rem]">
                  上传一份 Word 文档，
                  <br />
                  按主题与观点切分它
                </h2>

                <p className="mt-4 max-w-xl text-[0.98rem] leading-7 text-[var(--ink-soft)]">
                  服务端会先抽取文档正文，再由{" "}
                  <span className="font-medium text-zinc-950">
                    doubao-seed-2-0-pro-260215
                  </span>{" "}
                  判断章节、观点和论证目标何时真正发生切换。输出不是机械分段，而是更贴近文档本身的语义结构。
                </p>
              </div>

              <aside className="flex flex-col justify-between rounded-[1.6rem] border border-[var(--rule)] bg-[rgba(239,228,210,0.62)] p-5">
                <div>
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">
                    说明
                  </p>
                  <p className="mt-3 font-serif text-[1.55rem] leading-tight text-zinc-950">
                    一次上传，
                    <br />
                    直接查看结构结果。
                  </p>
                </div>
                <div className="mt-6 space-y-2.5 text-[0.92rem] leading-6 text-[var(--ink-soft)]">
                  <p>支持 `.doc` / `.docx`。</p>
                  <p>保留分块的起止行号、核心观点、标签与关键词。</p>
                  <p>上传大文件时，页面会显示完整的阶段式 loading 状态。</p>
                </div>
              </aside>
            </div>
          </section>

          <section className="rounded-[2rem] border border-[var(--rule)] bg-[rgba(255,252,247,0.9)] px-5 py-6 shadow-[0_20px_56px_rgba(34,22,15,0.05)] sm:px-7">
            <div className="grid gap-6 lg:grid-cols-[1fr_230px]">
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
                    上传文档
                  </p>
                  <h3 className="mt-2 font-serif text-[1.8rem] leading-tight tracking-[-0.03em] text-zinc-950">
                    选择要分析的文件
                  </h3>
                </div>

                <label className="block space-y-3">
                  <span className="text-sm font-medium text-zinc-700">
                    Word 文件
                  </span>
                  <div className="rounded-[1.55rem] border border-dashed border-[var(--accent)]/35 bg-[rgba(123,53,38,0.04)] p-4">
                    <input
                      type="file"
                      accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event) =>
                        setFile(event.target.files?.[0] ?? null)
                      }
                      className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#64281d]"
                    />
                    <p className="mt-3 text-[0.93rem] leading-6 text-[var(--ink-soft)]">
                      推荐上传结构比较清晰的文档。当前限制 10MB，`docx` 使用
                      `mammoth`，`doc` 使用 `word-extractor`，随后交由 Doubao 模型完成主题切分和要点提炼。
                    </p>
                  </div>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#342b24] disabled:cursor-not-allowed disabled:bg-zinc-400"
                    disabled={!canSubmit || isPending || isLoading}
                  >
                    {isLoading ? loadingSteps[loadingStepIndex] : "上传并语义分块"}
                  </button>
                  <p className="text-[0.92rem] text-[var(--ink-soft)]">
                    {file
                      ? `已收稿：${file.name}`
                      : "请选择一个 .doc 或 .docx 文档。"}
                  </p>
                </div>
              </form>

              <aside className="border-t border-[var(--rule)] pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">
                  处理状态
                </p>
                <div className="mt-3 rounded-[1.45rem] border border-[var(--rule)] bg-[rgba(16,47,80,0.92)] px-4 py-4 text-white">
                  <p className="text-[0.66rem] uppercase tracking-[0.2em] text-white/60">
                    当前状态
                  </p>
                  <p className="mt-2.5 font-serif text-[1.85rem] leading-none">
                    {isLoading ? "处理中" : result ? "已完成" : "待处理"}
                  </p>
                  <p className="mt-3 text-[0.92rem] leading-6 text-white/75">
                    {isLoading
                      ? "正在分阶段处理这份文档。"
                      : result
                        ? "文档已完成切分，可以查看每一组观点内容。"
                        : "等待你上传新的文档。"}
                  </p>
                </div>
              </aside>
            </div>

            {isLoading ? (
              <div className="mt-6 rounded-[1.55rem] border border-[var(--rule)] bg-[rgba(255,251,246,0.95)] p-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-3 w-3 rounded-full bg-[var(--accent)] animate-pulse" />
                  <p className="text-sm font-medium text-zinc-900">
                    {loadingSteps[loadingStepIndex]}
                  </p>
                </div>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {loadingSteps.map((step, index) => {
                    const isDone = index < loadingStepIndex;
                    const isCurrent = index === loadingStepIndex;

                    return (
                      <div
                        key={step}
                        className={`rounded-[1.2rem] border px-3.5 py-3 text-[0.92rem] leading-6 ${
                          isCurrent
                            ? "border-[var(--accent)]/35 bg-[rgba(123,53,38,0.07)] text-zinc-950"
                            : isDone
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-[var(--rule)] bg-white/75 text-[var(--ink-soft)]"
                        }`}
                      >
                        {step}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
          <section className="rounded-[1.8rem] border border-[var(--rule)] bg-[#171413] p-5 text-white shadow-[0_20px_56px_rgba(18,14,11,0.2)]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
              <h2 className="font-serif text-[1.6rem]">结果概览</h2>
              <span className="rounded-full border border-white/15 px-3 py-1 text-[0.64rem] uppercase tracking-[0.18em] text-white/70">
                {isLoading ? "处理中" : result ? "已完成" : "未开始"}
              </span>
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
              {[
                ["文件", result?.fileName ?? "等待上传"],
                ["解析器", result?.parser ?? "等待上传"],
                ["模型", result?.model ?? "等待上传"],
                ["单元数", `${result?.unitCount ?? 0}`],
                ["分块数", `${result?.chunkCount ?? 0}`],
                ["请求次数", `${result?.usage.requestCount ?? 0}`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1.15rem] border border-white/8 bg-white/5 px-3.5 py-3"
                >
                  <p className="text-[0.64rem] uppercase tracking-[0.2em] text-white/45">
                    {label}
                  </p>
                  <p className="mt-1.5 text-[0.92rem] leading-6 text-white/90">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-[var(--rule)] bg-[rgba(251,246,238,0.9)] p-5 shadow-[0_18px_48px_rgba(55,37,24,0.06)]">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
              模型用量
            </p>
            <div className="mt-4 grid gap-2.5">
              {[
                ["输入 Token", `${result?.usage.promptTokens ?? 0}`],
                ["输出 Token", `${result?.usage.completionTokens ?? 0}`],
                ["总 Token", `${result?.usage.totalTokens ?? 0}`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1.15rem] border border-[var(--rule)] bg-white/80 px-3.5 py-3"
                >
                  <p className="text-[0.64rem] uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                    {label}
                  </p>
                  <p className="mt-1.5 font-serif text-[1.55rem] leading-none text-zinc-950">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {error ? (
        <div className="rounded-[1.45rem] border border-[#c86b59]/25 bg-[#fff5f2] px-4 py-3.5 text-[0.94rem] leading-6 text-[#8a3928]">
          {error}
        </div>
      ) : null}

      <section className="rounded-[2rem] border border-[var(--rule)] bg-[rgba(255,252,247,0.88)] px-5 py-6 shadow-[0_20px_56px_rgba(46,31,20,0.05)] sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--rule)] pb-4">
          <div>
            <h2 className="font-serif text-[1.9rem] leading-tight tracking-[-0.03em] text-zinc-950 sm:text-[2.2rem]">
              分块结果
            </h2>
            <p className="mt-2 text-[0.94rem] leading-6 text-[var(--ink-soft)]">
              每个版块都标出行号、核心观点、标签、关键词和正文原文。
            </p>
          </div>
          <div className="rounded-full border border-[var(--rule)] px-4 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            {result ? `已抽取 ${result.extractedTextLength} 字` : "等待来稿"}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {result?.chunks.length ? (
            result.chunks.map((chunk) => (
              <article
                key={`${chunk.index}-${chunk.startUnit}-${chunk.endUnit}`}
                className="relative overflow-hidden rounded-[1.75rem] border border-[var(--rule)] bg-[rgba(251,246,238,0.94)] p-5 shadow-[0_14px_36px_rgba(57,37,21,0.045)] sm:p-6"
              >
                <div className="pointer-events-none absolute right-5 top-3 font-serif text-5xl leading-none tracking-[-0.05em] text-black/[0.045]">
                  {String(chunk.index + 1).padStart(2, "0")}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-white">
                      第 {chunk.index + 1} 块
                    </span>
                    <span className="rounded-full border border-[var(--rule)] px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      {breakReasonLabels[chunk.breakReason]}
                    </span>
                    <span className="rounded-full border border-[var(--rule)] px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      第 {chunk.startLine}-{chunk.endLine} 行
                    </span>
                  </div>

                  <h3 className="mt-4 max-w-3xl font-serif text-[1.7rem] leading-tight tracking-[-0.03em] text-zinc-950 sm:text-[2rem]">
                    {chunk.title}
                  </h3>

                  <div className="mt-4 border-l-2 border-[var(--accent)] pl-4">
                    <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                      核心观点
                    </p>
                    <p className="mt-2.5 font-serif text-[1.45rem] leading-8 text-[#2b211b] sm:text-[1.7rem]">
                      {chunk.coreViewpoint}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.25rem] border border-[var(--rule)] bg-white/80 p-4">
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                        切分原因
                      </p>
                      <p className="mt-2.5 text-[0.93rem] leading-6 text-zinc-700">
                        {chunk.reason}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-[var(--rule)] bg-white/80 p-4">
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                        分块信息
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2 text-[0.78rem] text-zinc-600">
                        <span className="rounded-full bg-zinc-100 px-3 py-1">
                          {chunk.charCount} 字
                        </span>
                        <span className="rounded-full bg-zinc-100 px-3 py-1">
                          {chunk.unitCount} 个单元
                        </span>
                        <span className="rounded-full bg-zinc-100 px-3 py-1">
                          单元 {chunk.startUnit + 1}-{chunk.endUnit + 1}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.25rem] border border-[var(--rule)] bg-white/80 p-4">
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                        标签
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {chunk.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[#efe4d2] px-3 py-1 text-xs font-medium text-[#4b3729]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-[var(--rule)] bg-white/80 p-4">
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                        关键词
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {chunk.keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-[rgba(16,47,80,0.08)] px-3 py-1 text-xs font-medium text-[var(--accent-strong)]"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1.45rem] border border-[var(--rule)] bg-white/84 p-4">
                    <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                      原文内容
                    </p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-sans text-[0.94rem] leading-7 text-zinc-800">
                      {chunk.content}
                    </pre>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[1.55rem] border border-dashed border-[var(--rule)] bg-[rgba(251,246,238,0.8)] px-5 py-8 text-[0.94rem] leading-7 text-[var(--ink-soft)]">
              上传文档后，这里会显示语义分块结果。
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-[var(--rule)] bg-[rgba(251,246,238,0.86)] px-5 py-6 shadow-[0_18px_48px_rgba(44,29,18,0.05)] sm:px-7">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <h2 className="font-serif text-[1.85rem] leading-tight tracking-[-0.03em] text-zinc-950">
              抽取文本预览
            </h2>
            <p className="mt-2 text-[0.94rem] leading-6 text-[var(--ink-soft)]">
              这里展示解析后的前 500 个字符，用来判断抽取质量与版面清洁度。
            </p>
          </div>
          <div className="rounded-[1.45rem] border border-[var(--rule)] bg-white/82 p-4">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-serif text-[0.98rem] leading-7 text-[#312821]">
              {result?.extractedTextPreview ??
                "上传文档后，这里会显示抽取出的正文预览。"}
            </pre>
          </div>
        </div>
      </section>
    </section>
  );
}
