// supabase/functions/_shared/db.ts
// service-role クライアント生成、expense_sync_rules 適用ヘルパ、
// briefings/sync_log 書き込みヘルパ、共通の日付/整形ユーティリティ（Asia/Tokyo基準）。
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

/** service_role キーで動く Supabase クライアントを生成する（RLSをバイパスするため、全クエリで user_id を明示的に絞り込むこと）。 */
export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** `https://<ref>.supabase.co/functions/v1` を SUPABASE_URL から導出する（プロジェクトrefのハードコード回避）。 */
export function functionsBaseUrl(): string {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL が未設定です");
  return `${url.replace(/\/$/, "")}/functions/v1`;
}

// ===================== 日付ユーティリティ（Asia/Tokyo基準。UTCのDate.now()直用禁止） =====================

/** 今日の日付を Asia/Tokyo 基準で "YYYY-MM-DD" で返す。 */
export function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "YYYY-MM-DD" 文字列に日数を加算する（暦日演算。日本にはDSTが無いためUTC基準の日付演算で問題ない）。 */
export function addDaysJST(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" → 日本語の曜日（日〜土）。 */
export function weekdayJP(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ["日", "月", "火", "水", "木", "金", "土"][wd];
}

/** 整数円を "¥1,234" 形式に整形（負数は "-¥1,234"）。 */
export function yen(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "-" : "") + "¥" + Math.abs(v).toLocaleString("ja-JP");
}

/** 符号付き金額を "+¥1,234" / "-¥0" 形式に整形（0以下は"-"扱い）。 */
export function sgnYen(n: number): string {
  const v = Math.round(n);
  return (v > 0 ? "+" : "-") + "¥" + Math.abs(v).toLocaleString("ja-JP");
}

// ===================== expense_sync_rules 適用ヘルパ =====================

export interface SyncRule {
  id: number;
  pattern: string;
  target: "remark" | "sub_account";
  card_name: string | null;
  category_name: string | null;
  mark_special: boolean;
  priority: number;
  is_active: boolean;
}

/** 指定 target のアクティブなルールを priority 昇順（数字が小さいほど優先）で取得する。 */
export async function loadActiveRules(
  db: SupabaseClient,
  userId: string,
  target: "remark" | "sub_account",
): Promise<SyncRule[]> {
  const { data, error } = await db
    .from("expense_sync_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("target", target)
    .eq("is_active", true)
    .order("priority", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SyncRule[];
}

/** priority順のルール配列から、text に最初にマッチするルールを返す（不正な正規表現は無視してスキップ）。 */
export function firstMatchingRule(
  rules: SyncRule[],
  text: string,
): SyncRule | null {
  for (const r of rules) {
    try {
      if (new RegExp(r.pattern, "i").test(text)) return r;
    } catch {
      // ルールのpatternが不正な正規表現の場合はスキップ（同期全体は止めない）
      continue;
    }
  }
  return null;
}

/** expense_categories / expense_cards の name→id マップを読み込む（対象ユーザーの行のみ）。 */
export async function loadNameMaps(db: SupabaseClient, userId: string): Promise<{
  categoryIdByName: Map<string, number>;
  cardIdByName: Map<string, number>;
}> {
  const [{ data: cats, error: ce }, { data: cards, error: cae }] = await Promise.all([
    db.from("expense_categories").select("id,name").eq("user_id", userId),
    db.from("expense_cards").select("id,name").eq("user_id", userId),
  ]);
  if (ce) throw ce;
  if (cae) throw cae;
  const categoryIdByName = new Map<string, number>();
  (cats ?? []).forEach((c: { id: number; name: string }) => categoryIdByName.set(c.name, c.id));
  const cardIdByName = new Map<string, number>();
  (cards ?? []).forEach((c: { id: number; name: string }) => cardIdByName.set(c.name, c.id));
  return { categoryIdByName, cardIdByName };
}

// ===================== briefings / sync_log 書き込みヘルパ =====================

export type Severity = "ok" | "warn" | "alert";

/** expense_briefings に (user_id, brief_date, kind) で upsert する。 */
export async function upsertBriefing(
  db: SupabaseClient,
  userId: string,
  briefDate: string,
  kind: "morning" | "alert",
  title: string,
  body: string,
  severity: Severity,
): Promise<void> {
  const { error } = await db.from("expense_briefings").upsert(
    {
      user_id: userId,
      brief_date: briefDate,
      kind,
      title,
      body,
      severity,
    },
    { onConflict: "user_id,brief_date,kind" },
  );
  if (error) throw error;
}

/** expense_sync_log に1行 insert する（失敗してもcronの本処理は止めない）。 */
export async function insertSyncLog(
  db: SupabaseClient,
  userId: string,
  ok: boolean,
  insertedCount: number,
  message: string,
): Promise<void> {
  const { error } = await db.from("expense_sync_log").insert({
    user_id: userId,
    ok,
    inserted_count: insertedCount,
    message,
  });
  if (error) {
    // ログ書き込み自体の失敗はコンソールに残すのみ（サーバレス関数の応答は妨げない）
    console.error("expense_sync_log insert failed:", error);
  }
}
