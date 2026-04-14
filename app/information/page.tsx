import type { Metadata } from "next";

import { InformationFeed } from "@/components/information-feed";
import { getInformationSnapshot } from "@/lib/information/service";

export const metadata: Metadata = {
  title: "商业资讯滚动流",
  description:
    "使用 LangGraph 编排抓取当日商业资讯，分类写入数据库，并以持续滚动的信息流方式展示。",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function InformationPage() {
  const snapshot = await getInformationSnapshot({
    limit: null,
    hydrateIfEmpty: true,
  });

  return (
    <main className="information-page-bg flex min-h-screen flex-col">
      <InformationFeed initialSnapshot={snapshot} />
    </main>
  );
}
