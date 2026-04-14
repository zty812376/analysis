import { createHash, randomUUID } from "node:crypto";

import {
  INFORMATION_CATEGORY_LABELS,
  createEmptyCategoryCounts,
  type InformationCategoryKey,
  type InformationItemRecord,
  type InformationRunRecord,
  type InformationRunStatus,
} from "@/lib/information/types";
import { getPostgresPool } from "@/lib/postgres/client";

type StoredInformationItemInput = {
  dayKey: string;
  category: InformationCategoryKey;
  title: string;
  summary: string;
  sourceName: string;
  sourceDomain: string;
  sourceUrl: string;
  feedKey: string;
  feedLabel: string;
  author: string | null;
  publishedAt: string;
  tags: string[];
  reasoning: string;
  originalDescription: string;
  rawPayload: unknown;
};

type SaveInformationRunInput = {
  targetDay: string;
  timezone: string;
  status: InformationRunStatus;
  sourceCount: number;
  sourceKeys: string[];
  rawCount: number;
  candidateCount: number;
  keptCount: number;
  items: StoredInformationItemInput[];
  model: string;
  notes: string[];
  errors: string[];
};

type GlobalInformationStorageState = typeof globalThis & {
  __analysisInformationTablesReady__?: Promise<void>;
};

const informationCategoryConstraint = Object.keys(
  INFORMATION_CATEGORY_LABELS
)
  .map((key) => `'${key}'`)
  .join(", ");

function normalizeSourceUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    url.hash = "";

    const removableSearchParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "mod",
      "oc",
      "taid",
      "guccounter",
      "guce_referrer",
      "guce_referrer_sig",
    ];

    for (const key of removableSearchParams) {
      url.searchParams.delete(key);
    }

    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

function buildInformationItemId(item: StoredInformationItemInput) {
  return createHash("sha256")
    .update(normalizeSourceUrl(item.sourceUrl) || `${item.sourceName}:${item.title}`)
    .digest("hex");
}

async function ensureInformationTables() {
  const globalState = globalThis as GlobalInformationStorageState;

  if (!globalState.__analysisInformationTablesReady__) {
    const readyPromise = (async () => {
      const pool = getPostgresPool();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS information_ingest_runs (
          id text PRIMARY KEY,
          target_day text NOT NULL,
          timezone text NOT NULL,
          status text NOT NULL CHECK (status IN ('completed', 'failed')),
          source_count integer NOT NULL,
          raw_count integer NOT NULL,
          candidate_count integer NOT NULL,
          kept_count integer NOT NULL,
          saved_count integer NOT NULL,
          model text NOT NULL,
          notes jsonb NOT NULL,
          errors jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS information_items (
          id text PRIMARY KEY,
          day_key text NOT NULL,
          category text NOT NULL CHECK (category IN (${informationCategoryConstraint})),
          title text NOT NULL,
          summary text NOT NULL,
          source_name text NOT NULL,
          source_domain text NOT NULL,
          source_url text NOT NULL,
          feed_key text NOT NULL,
          feed_label text NOT NULL,
          author text,
          published_at timestamptz NOT NULL,
          tags jsonb NOT NULL,
          reasoning text NOT NULL,
          original_description text NOT NULL,
          raw_payload jsonb NOT NULL,
          run_id text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS information_ingest_runs_target_day_idx
        ON information_ingest_runs (target_day, created_at DESC)
      `);

      await pool.query(`
        DROP INDEX IF EXISTS information_items_day_key_idx
      `);

      await pool.query(`
        ALTER TABLE information_items
        DROP COLUMN IF EXISTS importance_score
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS information_items_day_key_idx
        ON information_items (day_key, published_at DESC)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS information_items_category_idx
        ON information_items (category, day_key, published_at DESC)
      `);
    })();

    globalState.__analysisInformationTablesReady__ = readyPromise.catch(
      (error) => {
        delete globalState.__analysisInformationTablesReady__;
        throw error;
      }
    );
  }

  return globalState.__analysisInformationTablesReady__;
}

function mapRunRow(row: {
  id: string;
  target_day: string;
  status: InformationRunStatus;
  source_count: number;
  raw_count: number;
  candidate_count: number;
  kept_count: number;
  saved_count: number;
  model: string;
  created_at: Date;
}): InformationRunRecord {
  return {
    id: row.id,
    targetDay: row.target_day,
    status: row.status,
    sourceCount: row.source_count,
    rawCount: row.raw_count,
    candidateCount: row.candidate_count,
    keptCount: row.kept_count,
    savedCount: row.saved_count,
    model: row.model,
    createdAt: row.created_at.toISOString(),
  };
}

function mapItemRow(row: {
  id: string;
  day_key: string;
  category: InformationCategoryKey;
  title: string;
  summary: string;
  source_name: string;
  source_domain: string;
  source_url: string;
  feed_key: string;
  feed_label: string;
  author: string | null;
  published_at: Date;
  tags: string[];
  reasoning: string;
}): InformationItemRecord {
  return {
    id: row.id,
    dayKey: row.day_key,
    category: row.category,
    categoryLabel: INFORMATION_CATEGORY_LABELS[row.category],
    title: row.title,
    summary: row.summary,
    sourceName: row.source_name,
    sourceDomain: row.source_domain,
    sourceUrl: row.source_url,
    feedKey: row.feed_key,
    feedLabel: row.feed_label,
    author: row.author,
    publishedAt: row.published_at.toISOString(),
    tags: row.tags,
    reasoning: row.reasoning,
  };
}

export async function saveInformationRun(input: SaveInformationRunInput) {
  await ensureInformationTables();

  const runId = randomUUID();
  const pool = getPostgresPool();
  const client = await pool.connect();
  let savedCount = 0;

  try {
    await client.query("BEGIN");

    if (input.items.length > 0 && input.sourceKeys.length > 0) {
      await client.query(
        `
          DELETE FROM information_items
          WHERE day_key = $1
            AND NOT (feed_key = ANY($2::text[]))
        `,
        [input.targetDay, input.sourceKeys]
      );
    }

    for (const item of input.items) {
      await client.query(
        `
          INSERT INTO information_items (
            id,
            day_key,
            category,
            title,
            summary,
            source_name,
            source_domain,
            source_url,
            feed_key,
            feed_label,
            author,
            published_at,
            tags,
            reasoning,
            original_description,
            raw_payload,
            run_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12::jsonb, $13, $14, $15::jsonb, $16
          )
          ON CONFLICT (id) DO UPDATE SET
            day_key = EXCLUDED.day_key,
            category = EXCLUDED.category,
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            source_name = EXCLUDED.source_name,
            source_domain = EXCLUDED.source_domain,
            source_url = EXCLUDED.source_url,
            feed_key = EXCLUDED.feed_key,
            feed_label = EXCLUDED.feed_label,
            author = EXCLUDED.author,
            published_at = EXCLUDED.published_at,
            tags = EXCLUDED.tags,
            reasoning = EXCLUDED.reasoning,
            original_description = EXCLUDED.original_description,
            raw_payload = EXCLUDED.raw_payload,
            run_id = EXCLUDED.run_id,
            updated_at = now()
        `,
        [
          buildInformationItemId(item),
          item.dayKey,
          item.category,
          item.title,
          item.summary,
          item.sourceName,
          item.sourceDomain,
          normalizeSourceUrl(item.sourceUrl),
          item.feedKey,
          item.feedLabel,
          item.author,
          item.publishedAt,
          JSON.stringify(item.tags),
          item.reasoning,
          item.originalDescription,
          JSON.stringify(item.rawPayload),
          runId,
        ]
      );

      savedCount += 1;
    }

    const runResult = await client.query<{
      id: string;
      target_day: string;
      status: InformationRunStatus;
      source_count: number;
      raw_count: number;
      candidate_count: number;
      kept_count: number;
      saved_count: number;
      model: string;
      created_at: Date;
    }>(
      `
        INSERT INTO information_ingest_runs (
          id,
          target_day,
          timezone,
          status,
          source_count,
          raw_count,
          candidate_count,
          kept_count,
          saved_count,
          model,
          notes,
          errors
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb
        )
        RETURNING
          id,
          target_day,
          status,
          source_count,
          raw_count,
          candidate_count,
          kept_count,
          saved_count,
          model,
          created_at
      `,
      [
        runId,
        input.targetDay,
        input.timezone,
        input.status,
        input.sourceCount,
        input.rawCount,
        input.candidateCount,
        input.keptCount,
        savedCount,
        input.model,
        JSON.stringify(input.notes),
        JSON.stringify(input.errors),
      ]
    );

    await client.query("COMMIT");

    const row = runResult.rows[0];

    if (!row) {
      throw new Error("资讯写入完成后未返回运行记录。");
    }

    return mapRunRow(row);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getLatestInformationRun() {
  await ensureInformationTables();

  const pool = getPostgresPool();
  const result = await pool.query<{
    id: string;
    target_day: string;
    status: InformationRunStatus;
    source_count: number;
    raw_count: number;
    candidate_count: number;
    kept_count: number;
    saved_count: number;
    model: string;
    created_at: Date;
  }>(
    `
      SELECT
        id,
        target_day,
        status,
        source_count,
        raw_count,
        candidate_count,
        kept_count,
        saved_count,
        model,
        created_at
      FROM information_ingest_runs
      ORDER BY created_at DESC
      LIMIT 1
    `
  );

  const row = result.rows[0];

  return row ? mapRunRow(row) : null;
}

export async function getLatestInformationRunForDay(dayKey: string) {
  await ensureInformationTables();

  const pool = getPostgresPool();
  const result = await pool.query<{
    id: string;
    target_day: string;
    status: InformationRunStatus;
    source_count: number;
    raw_count: number;
    candidate_count: number;
    kept_count: number;
    saved_count: number;
    model: string;
    created_at: Date;
  }>(
    `
      SELECT
        id,
        target_day,
        status,
        source_count,
        raw_count,
        candidate_count,
        kept_count,
        saved_count,
        model,
        created_at
      FROM information_ingest_runs
      WHERE target_day = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [dayKey]
  );

  const row = result.rows[0];

  return row ? mapRunRow(row) : null;
}

function hasQueryLimit(limit?: number | null): limit is number {
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0;
}

export async function listInformationItemsByDay(
  dayKey: string,
  limit?: number | null
) {
  await ensureInformationTables();

  const pool = getPostgresPool();
  const baseQuery = `
      SELECT
        id,
        day_key,
        category,
        title,
        summary,
        source_name,
        source_domain,
        source_url,
        feed_key,
        feed_label,
        author,
        published_at,
        tags,
        reasoning
      FROM information_items
      WHERE day_key = $1
      ORDER BY published_at DESC
    `;
  const result = await pool.query<{
    id: string;
    day_key: string;
    category: InformationCategoryKey;
    title: string;
    summary: string;
    source_name: string;
    source_domain: string;
    source_url: string;
    feed_key: string;
    feed_label: string;
    author: string | null;
    published_at: Date;
    tags: string[];
    reasoning: string;
  }>(
    hasQueryLimit(limit) ? `${baseQuery}\n      LIMIT $2` : baseQuery,
    hasQueryLimit(limit) ? [dayKey, limit] : [dayKey]
  );

  return result.rows.map(mapItemRow);
}

export async function listLatestInformationItems(limit?: number | null) {
  await ensureInformationTables();

  const pool = getPostgresPool();
  const baseQuery = `
      SELECT
        id,
        day_key,
        category,
        title,
        summary,
        source_name,
        source_domain,
        source_url,
        feed_key,
        feed_label,
        author,
        published_at,
        tags,
        reasoning
      FROM information_items
      ORDER BY day_key DESC, published_at DESC
    `;
  const result = await pool.query<{
    id: string;
    day_key: string;
    category: InformationCategoryKey;
    title: string;
    summary: string;
    source_name: string;
    source_domain: string;
    source_url: string;
    feed_key: string;
    feed_label: string;
    author: string | null;
    published_at: Date;
    tags: string[];
    reasoning: string;
  }>(
    hasQueryLimit(limit) ? `${baseQuery}\n      LIMIT $1` : baseQuery,
    hasQueryLimit(limit) ? [limit] : []
  );

  return result.rows.map(mapItemRow);
}

export function countInformationItemsByCategory(items: InformationItemRecord[]) {
  const counts = createEmptyCategoryCounts();

  for (const item of items) {
    counts[item.category] += 1;
  }

  return counts;
}
