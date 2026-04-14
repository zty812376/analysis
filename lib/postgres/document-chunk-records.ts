import { createHash, randomUUID } from "node:crypto";

import {
  createBailianEmbeddings,
  getBailianEmbeddingDimensions,
} from "@/lib/llm/bailian-embeddings";
import type { SemanticChunkingResult } from "@/lib/documents/semantic-chunker";
import { getPostgresPool } from "@/lib/postgres/client";

type SaveDocumentChunkRecordInput = {
  fileName: string;
  fileSizeBytes: number;
  fileType: "doc" | "docx";
  parser: "mammoth" | "word-extractor";
  extractedText: string;
  chunking: SemanticChunkingResult;
};

type SaveDocumentChunkRecordResult = {
  id: string;
  createdAt: string;
};

type GlobalDocumentChunkStorageState = typeof globalThis & {
  __analysisDocumentChunkTableReady__?: Promise<void>;
};

function toPgVectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}

async function ensureDocumentChunkTable() {
  const globalState = globalThis as GlobalDocumentChunkStorageState;

  if (!globalState.__analysisDocumentChunkTableReady__) {
    const readyPromise = (async () => {
      const pool = getPostgresPool();
      const vectorDimensions = getBailianEmbeddingDimensions();

      await pool.query(`
        CREATE EXTENSION IF NOT EXISTS vector
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS document_chunk_runs (
          id text PRIMARY KEY,
          file_name text NOT NULL,
          file_size_bytes integer NOT NULL,
          file_type text NOT NULL CHECK (file_type IN ('doc', 'docx')),
          parser text NOT NULL CHECK (parser IN ('mammoth', 'word-extractor')),
          content_sha256 text NOT NULL,
          extracted_text text NOT NULL,
          extracted_text_length integer NOT NULL,
          extracted_text_preview text NOT NULL,
          model text NOT NULL,
          unit_count integer NOT NULL,
          chunk_count integer NOT NULL,
          usage jsonb NOT NULL,
          chunks jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS document_chunk_items (
          id text PRIMARY KEY,
          run_id text NOT NULL REFERENCES document_chunk_runs (id) ON DELETE CASCADE,
          chunk_number integer NOT NULL,
          title text NOT NULL,
          core_viewpoint text NOT NULL,
          reason text NOT NULL,
          chunk_info jsonb NOT NULL,
          tags jsonb NOT NULL,
          keywords jsonb NOT NULL,
          content vector(${vectorDimensions}) NOT NULL,
          preview text NOT NULL,
          char_count integer NOT NULL,
          unit_count integer NOT NULL,
          start_unit integer NOT NULL,
          end_unit integer NOT NULL,
          start_line integer NOT NULL,
          end_line integer NOT NULL,
          break_reason text NOT NULL CHECK (break_reason IN ('start', 'semantic_break', 'heading_break')),
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(run_id, chunk_number)
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS document_chunk_runs_created_at_idx
        ON document_chunk_runs (created_at DESC)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS document_chunk_runs_content_sha256_idx
        ON document_chunk_runs (content_sha256)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS document_chunk_items_run_id_idx
        ON document_chunk_items (run_id, chunk_number)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS document_chunk_items_break_reason_idx
        ON document_chunk_items (break_reason)
      `);
    })();

    globalState.__analysisDocumentChunkTableReady__ = readyPromise.catch(
      (error) => {
        delete globalState.__analysisDocumentChunkTableReady__;
        throw error;
      }
    );
  }

  return globalState.__analysisDocumentChunkTableReady__;
}

function buildContentHash(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function saveDocumentChunkRecord(
  input: SaveDocumentChunkRecordInput
): Promise<SaveDocumentChunkRecordResult> {
  await ensureDocumentChunkTable();

  const id = randomUUID();
  const extractedTextPreview = input.extractedText.slice(0, 500);
  const pool = getPostgresPool();
  const client = await pool.connect();
  const vectorDimensions = getBailianEmbeddingDimensions();
  const embeddings = await createBailianEmbeddings({
    texts: input.chunking.chunks.map((chunk) => chunk.content),
  });

  if (embeddings.dimensions !== vectorDimensions) {
    throw new Error(
      `百炼 Embedding 返回维度 ${embeddings.dimensions}，与配置维度 ${vectorDimensions} 不一致。`
    );
  }

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      created_at: Date;
    }>(
      `
        INSERT INTO document_chunk_runs (
          id,
          file_name,
          file_size_bytes,
          file_type,
          parser,
          content_sha256,
          extracted_text,
          extracted_text_length,
          extracted_text_preview,
          model,
          unit_count,
          chunk_count,
          usage,
          chunks
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb
        )
        RETURNING id, created_at
      `,
      [
        id,
        input.fileName,
        input.fileSizeBytes,
        input.fileType,
        input.parser,
        buildContentHash(input.extractedText),
        input.extractedText,
        input.extractedText.length,
        extractedTextPreview,
        input.chunking.model,
        input.chunking.unitCount,
        input.chunking.chunkCount,
        JSON.stringify(input.chunking.usage),
        JSON.stringify(input.chunking.chunks),
      ]
    );

    for (const [index, chunk] of input.chunking.chunks.entries()) {
      await client.query(
        `
          INSERT INTO document_chunk_items (
            id,
            run_id,
            chunk_number,
            title,
            core_viewpoint,
            reason,
            chunk_info,
            tags,
            keywords,
            content,
            preview,
            char_count,
            unit_count,
            start_unit,
            end_unit,
            start_line,
            end_line,
            break_reason
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::vector, $11, $12, $13, $14, $15, $16, $17, $18
          )
        `,
        [
          `${id}:${chunk.index + 1}`,
          id,
          chunk.index + 1,
          chunk.title,
          chunk.coreViewpoint,
          chunk.reason,
          JSON.stringify({
            charCount: chunk.charCount,
            unitCount: chunk.unitCount,
            startUnit: chunk.startUnit + 1,
            endUnit: chunk.endUnit + 1,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            breakReason: chunk.breakReason,
          }),
          JSON.stringify(chunk.tags),
          JSON.stringify(chunk.keywords),
          toPgVectorLiteral(embeddings.vectors[index] ?? []),
          chunk.preview,
          chunk.charCount,
          chunk.unitCount,
          chunk.startUnit + 1,
          chunk.endUnit + 1,
          chunk.startLine,
          chunk.endLine,
          chunk.breakReason,
        ]
      );
    }

    await client.query("COMMIT");

    const row = result.rows[0];

    if (!row) {
      throw new Error("PostgreSQL 未返回已保存的分块记录。");
    }

    return {
      id: row.id,
      createdAt: row.created_at.toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
