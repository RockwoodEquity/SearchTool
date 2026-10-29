import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteCriteriaRecord, listCriteriaRecords, saveCriteriaRecord } from "@/lib/db";
import {
  PLATFORM_EXCLUSIONS_KEY,
  defaultCriteria,
  defaultPlatformExclusions,
  isSearchType,
  sectorLabel,
  sectorsFor,
  type CriteriaSpec,
} from "@/lib/sectors";

export const runtime = "nodejs";

const MAX_DESCRIPTION = 8000;
const MAX_ITEMS = 40;
const MAX_ITEM_LENGTH = 1500;
const MAX_EXCLUSION_TEXT = 4000;

const ALL_KEYS = new Set<string>([...sectorsFor("addon"), ...sectorsFor("platform")]);

function cleanList(v: unknown, name: string): string[] | string {
  if (!Array.isArray(v) || v.some((s) => typeof s !== "string")) return `${name} must be a list of text lines`;
  const items = v.map((s: string) => s.trim()).filter((s) => s.length > 0);
  if (items.length > MAX_ITEMS) return `${name} can have at most ${MAX_ITEMS} lines`;
  if (items.some((s) => s.length > MAX_ITEM_LENGTH)) return `A line in ${name} is too long`;
  return items;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const type = req.nextUrl.searchParams.get("type");
  if (!isSearchType(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  try {
    const records = new Map((await listCriteriaRecords()).map((r) => [r.key, r]));
    const items = sectorsFor(type).map((key) => {
      const defaults = defaultCriteria(key)!;
      const rec = records.get(key);
      const saved = rec?.data as CriteriaSpec | undefined;
      return {
        key,
        label: sectorLabel(key),
        defaults,
        current: saved ?? defaults,
        custom: !!rec,
        updatedBy: rec?.updated_by ?? null,
        updatedAt: rec?.updated_at ?? null,
      };
    });

    const exRec = records.get(PLATFORM_EXCLUSIONS_KEY);
    const defaultText = defaultPlatformExclusions();
    const platformExclusions =
      type === "platform"
        ? {
            defaults: defaultText,
            current: (exRec?.data as { text?: string } | undefined)?.text ?? defaultText,
            custom: !!exRec,
            updatedBy: exRec?.updated_by ?? null,
            updatedAt: exRec?.updated_at ?? null,
          }
        : null;

    return NextResponse.json({ items, platformExclusions });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load criteria" }, { status: 500 });
  }
}

// Save one focus area (or the shared platform exclusions). Everyone's searches use it right away.
export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => null)) as {
    key?: unknown;
    description?: unknown;
    criteria?: unknown;
    keywords?: unknown;
    exclusions?: unknown;
    text?: unknown;
    expectedUpdatedAt?: unknown;
  } | null;

  if (!body || typeof body.key !== "string") return NextResponse.json({ error: "key is required" }, { status: 400 });
  const expected = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null;

  let data: CriteriaSpec | { text: string };
  if (body.key === PLATFORM_EXCLUSIONS_KEY) {
    if (typeof body.text !== "string" || body.text.length > MAX_EXCLUSION_TEXT) {
      return NextResponse.json({ error: `Exclusions must be text under ${MAX_EXCLUSION_TEXT} characters` }, { status: 400 });
    }
    data = { text: body.text.trim() };
  } else {
    if (!ALL_KEYS.has(body.key)) return NextResponse.json({ error: "Unknown focus area" }, { status: 400 });
    if (typeof body.description !== "string" || body.description.trim() === "" || body.description.length > MAX_DESCRIPTION) {
      return NextResponse.json({ error: `The description is required and must be under ${MAX_DESCRIPTION} characters` }, { status: 400 });
    }
    const criteria = cleanList(body.criteria, "Requirements");
    const keywords = cleanList(body.keywords, "Keywords");
    const exclusions = cleanList(body.exclusions, "Exclusion terms");
    for (const v of [criteria, keywords, exclusions]) {
      if (typeof v === "string") return NextResponse.json({ error: v }, { status: 400 });
    }
    data = {
      description: body.description.trim(),
      criteria: criteria as string[],
      keywords: keywords as string[],
      exclusions: exclusions as string[],
    };
  }

  try {
    const result = await saveCriteriaRecord(body.key, data, auth.user.name, expected);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Someone else changed this since you opened it. The latest version has been loaded; reapply your edit if you still want it." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, updatedAt: result.updated_at, updatedBy: auth.user.name });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save" }, { status: 500 });
  }
}

// Restore the shipped text.
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const key = req.nextUrl.searchParams.get("key");
  if (!key || (key !== PLATFORM_EXCLUSIONS_KEY && !ALL_KEYS.has(key))) {
    return NextResponse.json({ error: "Unknown focus area" }, { status: 400 });
  }
  try {
    await deleteCriteriaRecord(key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not restore" }, { status: 500 });
  }
}
