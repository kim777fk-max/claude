// supabase/functions/_shared/mf.ts
// MoneyForward クラウド会計 API: OAuth（認可URL生成/コード交換/refreshIfNeeded）と journals ページング取得。
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { functionsBaseUrl, todayJST, upsertBriefing } from "./db.ts";

// ============================================================
// エンドポイント（env で上書き可能。デフォルト値の出典:
// https://developers.api-accounting.moneyforward.com/ の OpenAPI 定義
// （securitySchemes.OAuth2 / servers / GET /api/v3/journals）2026-07-17確認）
// ============================================================

const DEFAULT_MF_AUTH_URL = "https://api.biz.moneyforward.com/authorize";
const DEFAULT_MF_TOKEN_URL = "https://api.biz.moneyforward.com/token";
const DEFAULT_MF_API_BASE = "https://api-accounting.moneyforward.com/api/v3";
// GET /journals に必要なスコープ（=「仕訳の参照」）。MFアプリポータル側でも同スコープの許可が必要。
const DEFAULT_MF_SCOPE = "mfc/accounting/journal.read";

export function mfAuthUrl(): string {
  return Deno.env.get("MF_AUTH_URL") || DEFAULT_MF_AUTH_URL;
}
export function mfTokenUrl(): string {
  return Deno.env.get("MF_TOKEN_URL") || DEFAULT_MF_TOKEN_URL;
}
export function mfApiBase(): string {
  return Deno.env.get("MF_API_BASE") || DEFAULT_MF_API_BASE;
}
export function mfScope(): string {
  return Deno.env.get("MF_SCOPE") || DEFAULT_MF_SCOPE;
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`env ${name} が未設定です（supabase secrets set で登録してください）`);
  return v;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

// ============================================================
// fetch リトライ（429/5xx は指数バックオフ3回まで）
// ============================================================
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      if (attempt >= maxRetries) throw e;
      await sleep(backoffMs(attempt));
      attempt++;
      continue;
    }
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt >= maxRetries) return res;
    await sleep(backoffMs(attempt));
    attempt++;
  }
}
function backoffMs(attempt: number): number {
  return 500 * Math.pow(2, attempt); // 500ms → 1s → 2s
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// OAuth: 認可URL生成 / コード交換 / refresh
// ============================================================

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = requireEnv("MF_CLIENT_ID");
  const u = new URL(mfAuthUrl());
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", mfScope());
  u.searchParams.set("state", state);
  return u.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // 秒
}

/** MF認可サーバーのクライアント認証は client_secret_basic（Basicヘッダ必須・ボディのsecretは不可 [A157304]）。 */
function basicAuthHeader(): string {
  const clientId = requireEnv("MF_CLIENT_ID");
  const clientSecret = requireEnv("MF_CLIENT_SECRET");
  return "Basic " + btoa(`${clientId}:${clientSecret}`);
}

async function postTokenRequest(params: Record<string, string>, label: string): Promise<TokenResponse> {
  const res = await fetchWithRetry(mfTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    throw new Error(`${label}: ${res.status} ${await safeText(res)}`);
  }
  return (await res.json()) as TokenResponse;
}

export function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  return postTokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri },
    "MFトークン交換に失敗",
  );
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return postTokenRequest(
    { grant_type: "refresh_token", refresh_token: refreshToken },
    "MFトークンrefreshに失敗",
  );
}

export interface RefreshOutcome {
  ok: boolean;
  accessToken?: string;
}

/**
 * mf_tokens.expires_at が5分以内なら refresh_token で更新する。
 * refresh失敗時（または未連携時）は expense_briefings に kind='alert' で再認証案内を upsert し、
 * { ok:false } を返す（呼び出し側は以降の処理を中断すること）。
 */
export async function refreshIfNeeded(
  db: SupabaseClient,
  userId: string,
): Promise<RefreshOutcome> {
  const { data: tok, error } = await db
    .from("mf_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  if (!tok) {
    await writeReauthAlert(db, userId, "MoneyForwardと未連携です。初回認証を行ってください。");
    return { ok: false };
  }

  const expiresAtMs = new Date(tok.expires_at).getTime();
  const soonMs = Date.now() + 5 * 60 * 1000;
  if (expiresAtMs > soonMs) {
    return { ok: true, accessToken: tok.access_token };
  }

  try {
    const refreshed = await refreshAccessToken(tok.refresh_token);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    const { error: upErr } = await db.from("mf_tokens").upsert({
      user_id: userId,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || tok.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    });
    if (upErr) throw upErr;
    return { ok: true, accessToken: refreshed.access_token };
  } catch (e) {
    await writeReauthAlert(db, userId, `トークン更新に失敗しました：${(e as Error).message}`);
    return { ok: false };
  }
}

async function writeReauthAlert(
  db: SupabaseClient,
  userId: string,
  reason: string,
): Promise<void> {
  const briefDate = todayJST();
  const reauthUrl = `${functionsBaseUrl()}/mf-oauth/start`;
  const title = "⚠ MoneyForward再認証が必要です";
  const body =
    `⚠ MoneyForwardの連携が切れています。\n` +
    `理由: ${reason}\n` +
    `以下のリンクから再認証してください:\n${reauthUrl}`;
  await upsertBriefing(db, userId, briefDate, "alert", title, body, "alert");
}

// ============================================================
// journals（仕訳）取得
// 実レスポンスは journals[].branches[]（各行に remark / debitor / creditor が1つずつ）。
// mf-sync 側の変換ロジック互換のため、branches を debits/credits 配列へ写像して返す
// （出典: developers.api-accounting.moneyforward.com OpenAPI GET /api/v3/journals 2026-07-17確認）。
// ============================================================

export interface MfJournalEntry {
  account_item_name: string;
  sub_account_name?: string | null;
  amount: number;
  description?: string | null;
}

export interface MfJournal {
  id: string | number;
  transaction_date: string; // "YYYY-MM-DD"
  journal_type?: string | null; // 実APIは journal_entry / adjusting_entry
  remark?: string | null;
  debits: MfJournalEntry[];
  credits: MfJournalEntry[];
}

// ---- 実APIの生レスポンス型（必要フィールドのみ） ----
interface MfRawBranchSide {
  value?: number | null;
  account_name?: string | null;
  sub_account_name?: string | null;
}

interface MfRawBranch {
  remark?: string | null;
  debitor?: MfRawBranchSide | null;
  creditor?: MfRawBranchSide | null;
}

interface MfRawJournal {
  id: string | number;
  transaction_date: string;
  journal_type?: string | null;
  branches?: MfRawBranch[] | null;
}

interface MfJournalsPage {
  journals: MfRawJournal[];
  metadata: { total_count: number; total_pages: number };
}

/** 実APIの branches 形式を、変換ロジックが期待する debits/credits 形式へ写像する。 */
function adaptJournal(raw: MfRawJournal): MfJournal {
  const branches = raw.branches ?? [];
  const debits: MfJournalEntry[] = [];
  const credits: MfJournalEntry[] = [];
  let remark: string | null = null;
  for (const b of branches) {
    if (!remark && b.remark) remark = b.remark;
    if (b.debitor?.account_name || b.debitor?.value) {
      debits.push({
        account_item_name: b.debitor?.account_name ?? "",
        sub_account_name: b.debitor?.sub_account_name ?? null,
        amount: Number(b.debitor?.value ?? 0),
        description: b.remark ?? null,
      });
    }
    if (b.creditor?.account_name || b.creditor?.value) {
      credits.push({
        account_item_name: b.creditor?.account_name ?? "",
        sub_account_name: b.creditor?.sub_account_name ?? null,
        amount: Number(b.creditor?.value ?? 0),
        description: b.remark ?? null,
      });
    }
  }
  return {
    id: raw.id,
    transaction_date: raw.transaction_date,
    journal_type: raw.journal_type ?? null,
    remark,
    debits,
    credits,
  };
}

/** 指定期間の仕訳を metadata.total_pages に従って全ページ取得する（期間指定は start_date / end_date）。 */
export async function fetchAllJournals(
  accessToken: string,
  fromDate: string,
  toDate: string,
): Promise<MfJournal[]> {
  const journals: MfJournal[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = new URL(`${mfApiBase()}/journals`);
    url.searchParams.set("start_date", fromDate);
    url.searchParams.set("end_date", toDate);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    const res = await fetchWithRetry(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`MF API journals取得に失敗: ${res.status} ${await safeText(res)}`);
    }
    const json = (await res.json()) as MfJournalsPage;
    journals.push(...(json.journals ?? []).map(adaptJournal));
    totalPages = json.metadata?.total_pages ?? 1;
    page++;
  } while (page <= totalPages);
  return journals;
}
