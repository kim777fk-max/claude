// supabase/functions/mf-oauth/index.ts
// GET /mf-oauth/start    … MFの認可URLへ302リダイレクト（state=CRON_SECRET由来のHMAC）
// GET /mf-oauth/callback … code→token交換、mf_tokensへupsert、簡易HTMLを返す
import { createServiceClient, functionsBaseUrl } from "../_shared/db.ts";
import { buildAuthorizeUrl, exchangeCodeForToken } from "../_shared/mf.ts";

const STATE_TTL_MS = 10 * 60 * 1000; // stateの有効期限（10分）

async function hmacHex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

function successHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>連携完了</title></head>
<body style="font-family:-apple-system,sans-serif;text-align:center;padding:48px">
<h1>✅ 連携完了</h1>
<p>MoneyForwardとの連携が完了しました。アプリに戻ってOKです。</p>
</body></html>`;
}

function errorHtml(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>連携失敗</title></head>
<body style="font-family:-apple-system,sans-serif;text-align:center;padding:48px">
<h1>❌ 連携に失敗しました</h1>
<p>${escapeHtml(message)}</p>
</body></html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cronSecret = Deno.env.get("CRON_SECRET");
  const userId = Deno.env.get("APP_USER_ID");
  if (!cronSecret || !userId) {
    return new Response("server misconfigured: CRON_SECRET/APP_USER_ID が未設定です", { status: 500 });
  }

  // -------- /start: MFの認可URLへリダイレクト --------
  if (url.pathname.endsWith("/start")) {
    const redirectUri = `${functionsBaseUrl()}/mf-oauth/callback`;
    const stateMsg = `mf-oauth:${Date.now()}`;
    const sig = await hmacHex(cronSecret, stateMsg);
    const state = `${stateMsg}:${sig}`;
    const authorizeUrl = buildAuthorizeUrl(redirectUri, state);
    return Response.redirect(authorizeUrl, 302);
  }

  // -------- /callback: code→token交換 --------
  if (url.pathname.endsWith("/callback")) {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return new Response(errorHtml("code / state がありません。/mf-oauth/start からやり直してください。"), {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // state検証（HMAC一致＋有効期限）
    const lastColon = state.lastIndexOf(":");
    const stateMsg = state.slice(0, lastColon);
    const sig = state.slice(lastColon + 1);
    const expectedSig = await hmacHex(cronSecret, stateMsg);
    if (sig !== expectedSig) {
      return new Response(errorHtml("stateが不正です。/mf-oauth/start からやり直してください。"), {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const ts = Number(stateMsg.split(":")[1]);
    if (!Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) {
      return new Response(errorHtml("stateの有効期限が切れています。/mf-oauth/start からやり直してください。"), {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    const redirectUri = `${functionsBaseUrl()}/mf-oauth/callback`;
    try {
      const token = await exchangeCodeForToken(code, redirectUri);
      const db = createServiceClient();
      const { error } = await db.from("mf_tokens").upsert({
        user_id: userId,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return new Response(successHtml(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch (e) {
      return new Response(errorHtml((e as Error).message), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  }

  return new Response("not found（/mf-oauth/start または /mf-oauth/callback を使用してください）", { status: 404 });
});
