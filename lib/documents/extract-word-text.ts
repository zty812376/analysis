import mammoth from "mammoth";
import WordExtractor from "word-extractor";

export type ExtractedWordDocument = {
  fileType: "doc" | "docx";
  parser: "mammoth" | "word-extractor";
  text: string;
};

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0007/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function extractWordDocumentText(input: {
  fileName: string;
  buffer: Buffer;
}): Promise<ExtractedWordDocument> {
  const lowerName = input.fileName.toLowerCase();

  if (lowerName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({
      buffer: input.buffer,
    });

    return {
      fileType: "docx",
      parser: "mammoth",
      text: normalizeExtractedText(result.value),
    };
  }

  if (lowerName.endsWith(".doc")) {
    const extractor = new WordExtractor();
    const document = await extractor.extract(input.buffer);
    const text = [
      document.getHeaders({ includeFooters: false }),
      document.getBody(),
      document.getFootnotes(),
      document.getEndnotes(),
      document.getAnnotations(),
      document.getTextboxes(),
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      fileType: "doc",
      parser: "word-extractor",
      text: normalizeExtractedText(text),
    };
  }

  throw new Error("仅支持 .doc 和 .docx 文档。");
}
