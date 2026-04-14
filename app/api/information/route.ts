import { z } from "zod";

import {
  getInformationSnapshot,
  refreshInformationFeed,
} from "@/lib/information/service";

const RefreshRequestSchema = z
  .object({
    force: z.boolean().optional(),
  })
  .optional();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const numericLimit = rawLimit == null ? Number.NaN : Number(rawLimit);
  const limit =
    rawLimit == null || rawLimit === "all"
      ? null
      : Number.isFinite(numericLimit) && numericLimit > 0
        ? Math.floor(numericLimit)
        : null;

  try {
    const snapshot = await getInformationSnapshot({
      limit,
      hydrateIfEmpty: false,
    });

    return Response.json(snapshot);
  } catch (error) {
    console.error("Information snapshot failed", error);

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "资讯读取失败。",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    payload = undefined;
  }

  const parsed = RefreshRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      { error: "刷新参数不合法。" },
      { status: 400 }
    );
  }

  try {
    const refresh = await refreshInformationFeed({
      force: parsed.data?.force ?? true,
    });
    const snapshot = await getInformationSnapshot({
      limit: null,
      hydrateIfEmpty: false,
    });

    return Response.json({
      refresh,
      snapshot,
    });
  } catch (error) {
    console.error("Information refresh failed", error);

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "资讯同步失败。",
      },
      { status: 500 }
    );
  }
}
