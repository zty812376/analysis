import { extractWordDocumentText } from "@/lib/documents/extract-word-text";
import { createSemanticChunks } from "@/lib/documents/semantic-chunker";
import { saveDocumentChunkRecord } from "@/lib/postgres/document-chunk-records";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "上传请求格式不正确。" }, { status: 400 });
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "请上传 .doc 或 .docx 文件。" }, { status: 400 });
  }

  if (!file.name.toLowerCase().match(/\.(doc|docx)$/)) {
    return Response.json(
      { error: "仅支持 .doc 和 .docx 文档。" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: "文件不能超过 10MB。" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractWordDocumentText({
      fileName: file.name,
      buffer,
    });

    if (!extracted.text.trim()) {
      return Response.json(
        { error: "文档解析成功，但未提取到正文内容。" },
        { status: 400 }
      );
    }

    const chunking = await createSemanticChunks(extracted.text);
    const storage = await saveDocumentChunkRecord({
      fileName: file.name,
      fileSizeBytes: file.size,
      fileType: extracted.fileType,
      parser: extracted.parser,
      extractedText: extracted.text,
      chunking,
    });

    return Response.json({
      fileName: file.name,
      fileType: extracted.fileType,
      parser: extracted.parser,
      extractedTextLength: extracted.text.length,
      extractedTextPreview: extracted.text.slice(0, 500),
      storage: {
        provider: "postgresql",
        recordId: storage.id,
        savedAt: storage.createdAt,
      },
      ...chunking,
    });
  } catch (error) {
    console.error("Document chunking failed", error);

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "文档分块失败。",
      },
      { status: 502 }
    );
  }
}
