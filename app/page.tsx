import { EmbeddingPlayground } from "@/components/embedding-playground";
import { LangGraphPlayground } from "@/components/langgraph-playground";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col pb-10">
      <EmbeddingPlayground />
      <LangGraphPlayground />
    </main>
  );
}
