import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Word Semantic Chunking Demo",
  description:
    "上传 DOC 或 DOCX 文档，使用 Doubao Seed 2.0 Pro 按语义分块并展示结果。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
