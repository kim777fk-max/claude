# Phase 2 実装仕様書 — 資金管理バックエンド（自動同期＋丸くん朝礼）

設計: Claude Fable 5 ／ 実装: サブエージェント（この仕様に従うこと）

## 0. 目的

現在は Claude セッションの MCP コネクタ経由で MoneyForward を読んでいるが、**接続が頻繁に切れる**。
これを **Supabase Edge Functions（サーバー側）** に移し、次を無人で回す：

1. **毎日の自動同期**：MF クラウド会計 API → `expense_transactions` へ upsert
2. **毎朝の丸くん朝礼**：残高・本日の予定・カード自由枠・最低残高予測を生成し、**アプリ内に表示**
3. **認証切れの自己通知**：トークン更新失敗を検知したら「再認証してください」をアプリ内に表示し、
   ワンクリック再認証リンクで復旧

通知チャネルの第1弾は**アプリ内**（追加アカウント不要で確実）。LINE/メールは後続（2.1）。

## 1. 全体アーキテクチャ

```
[cron 毎朝 06:45 JST] → Edge Fn: mf-sync ──→ MF会計API（OAuth, サーバー保管トークン）
                                   │              │ 失敗(401等)
                                   ▼              ▼
                          expense_transactions   expense_briefings に「要再認証」アラート
[cron 毎朝 07:00 JST] → Edge Fn: morning-brief → expense_briefings に朝礼を書き込み
                                                     │
                                  アプリ(app/index.html) が最新朝礼をバナー表示
[ユーザー1回だけ] → Edge Fn: mf-oauth/start → MF同意画面 → mf-oauth/callback → トークン保存
```

- Supabase プロジェクト: `npcyxxldrvtqrzdvrkvd`（既存。テーブルは `expense_*`、全行 `user_id` + RLS）
- 対象ユーザー: 単一（`APP_USER_ID` env で指定）。将来のマルチユーザーは tokens テーブルの行追加で拡張。

## 2. 追加するDB（migration: `supabase/migrations/*_phase2_backend.sql`）

```sql
-- OAuthトークン（service_roleのみアクセス可。RLSは有効化し、ポリシーを一切作らない）
create table mf_tokens (
  user_id uuid primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table mf_tokens enable row level security;

-- 同期の分類ルール（remark/科目のパターン → カード/項目/特別フラグ）
create table expense_sync_rules (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  pattern text not null,          -- 対象: MF仕訳の remark / sub_account_name に対する正規表現(case-insensitive)
  target text not null check (target in ('remark','sub_account')),
  card_name text,                 -- expense_cards.name に対応（NULL=変更しない）
  category_name text,             -- expense_categories.name に対応（NULL=変更しない）
  mark_special boolean not null default false,  -- true → description に「特別：」接頭辞（ゲーム対象外）
  priority int not null default 100,
  is_active boolean not null default true
);
alter table expense_sync_rules enable row level security;
create policy expense_sync_rules_own on expense_sync_rules for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 同期ログ
create table expense_sync_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  inserted_count int not null default 0,
  message text
);
alter table expense_sync_log enable row level security;
create policy expense_sync_log_read on expense_sync_log for select to authenticated
  using ((select auth.uid()) = user_id);

-- 朝礼・アラート（アプリが表示）
create table expense_briefings (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  brief_date date not null,
  kind text not null default 'morning' check (kind in ('morning','alert')),
  title text not null,
  body text not null,             -- 改行入りプレーンテキスト
  severity text not null default 'ok' check (severity in ('ok','warn','alert')),
  created_at timestamptz not null default now(),
  unique (user_id, brief_date, kind)
);
alter table expense_briefings enable row level security;
create policy expense_briefings_read on expense_briefings for select to authenticated
  using ((select auth.uid()) = user_id);
```

**初期ルール（seed。user_id は APP_USER_ID）**
- `(OPENAI|ANTHROPIC|GOOGLE.?\*?CLOUD|ELEST\.IO|RENDER\.COM|GITHUB|VERCEL|SUPABASE)` /remark → category=開発・AI, mark_special=true
- `PayPayカード` /sub_account → card=PayPay ／ `JCBANAJCB` → JCB ／ `LCJCB` → ライフ ／ `UCカード` → UC ／ `三井住友カード` → 三井住友
- `ライフ` /remark → category=食費 ／ `Suica|JR東日本` /remark → category=交通費

## 3. Edge Functions（`supabase/functions/` / Deno / TypeScript）

共通: `SUPABASE_URL`・`SUPABASE_SERVICE_ROLE_KEY` は Functions 実行環境から取得。
追加 secrets（`supabase secrets set` で登録。**コードに埋め込まない**）:
`MF_CLIENT_ID` / `MF_CLIENT_SECRET` / `APP_USER_ID` / `CRON_SECRET`（関数の手動起動保護用ランダム文字列）
env（デフォルト値つき・上書き可能）: `MF_AUTH_URL`, `MF_TOKEN_URL`, `MF_API_BASE`
（MF クラウド会計 API の OAuth/API エンドポイント。実装時に https://developers.biz.moneyforward.com の
最新ドキュメントで確認し、デフォルト値をコードコメントに出典付きで記載すること）

### 3.1 `mf-oauth`
- `GET /mf-oauth/start` … MF の認可URLへ 302（redirect_uri=`.../mf-oauth/callback`, state=CRON_SECRET由来のHMAC）
- `GET /mf-oauth/callback` … code→token 交換、`mf_tokens` に upsert、「連携完了。アプリに戻ってOK」の簡易HTMLを返す
- トークン更新は共通ヘルパ `refreshIfNeeded()`：expires_at が5分以内なら refresh_token で更新。
  **refresh 失敗時**: `expense_briefings` に kind='alert', severity='alert',
  body に `/mf-oauth/start` の再認証URLを含めて upsert し、以降の処理を中断。

### 3.2 `mf-sync`（cron: 毎日 06:45 JST）
- 認可: ヘッダ `x-cron-secret == CRON_SECRET` のときだけ実行（pg_cron からも手動 curl からも同じ）
- 手順:
  1. `refreshIfNeeded()`
  2. 取得範囲 = 直近14日（`start_date = today-14`）の仕訳を MF API `GET /journals`（ページング全件）
  3. 変換（既存データと同じ規約）:
     - `external_id = 'mfca:' + journal.id`（URLデコードした生ID）
     - 借方が費用系 → direction='expense'。貸方に `未払金` + sub_account がカード → payment_type='card'、
       `expense_sync_rules`(target=sub_account) で card_id を解決
     - 貸方/借方が `普通預金` → payment_type='bank'（みずほの入出金）、`現金` → 'cash'
     - 借方が `売上高` 等の収益 or 普通預金が借方 → direction='income'
     - description = remark。`expense_sync_rules`(target=remark) を priority 順に適用し
       category_id / mark_special（description に `特別：` 接頭）を決定
     - 期首仕訳（JOURNAL_TYPE_OPENING）はスキップ
  4. `expense_transactions` に upsert（`on_conflict=user_id,external_id`, ignoreDuplicates ではなく merge）
  5. `expense_sync_log` に結果を insert
- 冪等：同じ仕訳は external_id で必ず1行。

### 3.3 `morning-brief`（cron: 毎日 07:00 JST）
- 認可: 同上（x-cron-secret）
- Supabase から読むだけ（MF には触れない）。計算はアプリ `computeYear`/`buildDailyProjection` と同等：
  - 現在残高 = `expense_year_settings.opening_balance` + 今日までの cash/bank 実績純額
  - 今日の予定 = 今日日付の `予定：` 行（cash/bank）
  - カード自由枠 = 月上限 − 今月実績（`予定`/`特別` を除く）− 今月の `予定：`（カード別。上限は expense_card_limits）
  - 最低残高予測 = 今日残高から年末まで日次ウォーク（cash/bank の予定・実績を日付順に適用）した最小値と日付
- 出力例（body）:
  ```
  ☀️ 丸くん朝礼 7/5(日)
  💰 残高 ¥744,112（前日比 -¥0）
  📅 今日の予定: なし
  💳 自由枠: PayPay ¥11,757 / JCB ¥16,500 / ライフ ¥0 / 三井住友 ¥0
  📉 年内の底: 12/11 ¥28,645（安全ライン ¥0 以上）
  ```
  超過・安全ライン割れがあれば severity='warn'/'alert' で文面を厳しめに。
- `expense_briefings` に (user_id, brief_date, 'morning') で upsert。

### 3.4 cron 登録（migration か `docs/phase2-deploy.md` に SQL を記載）
pg_cron + pg_net で毎日実行（JST→UTC 変換に注意: 06:45 JST = 21:45 UTC 前日）:
```sql
select cron.schedule('mf-sync-daily','45 21 * * *',
  $$select net.http_post('https://npcyxxldrvtqrzdvrkvd.supabase.co/functions/v1/mf-sync',
    headers:='{"x-cron-secret":"<CRON_SECRET>"}'::jsonb)$$);
select cron.schedule('morning-brief-daily','0 22 * * *', $$ ... /functions/v1/morning-brief ... $$);
```

## 4. アプリ側の変更（`app/index.html`）

- 起動時に `expense_briefings` の最新1件（kind問わず、直近3日以内）を取得し、
  ダッシュボード最上部に表示（severity で ok=緑/warn=黄/alert=赤バナー。既存 .banner を流用）
- kind='alert'（認証切れ）は全タブ共通で表示し、本文中の再認証URLをリンク化
- 表示のみ（書き込みはサーバー側だけ）

## 5. 受け入れ基準

1. `mf-oauth/start` → MF同意 → callback でトークンが `mf_tokens` に入る
2. `curl -H "x-cron-secret: ..." .../mf-sync` で直近14日の仕訳が `expense_transactions` に冪等 upsert される
   （既存の手動同期分と external_id 体系が一致し、二重登録が起きない）
3. `morning-brief` 実行で `expense_briefings` に朝礼が入り、アプリのダッシュボードに表示される
4. refresh_token を故意に壊す → 次回 sync で kind='alert' が入り、アプリに赤バナー＋再認証リンクが出る
5. cron 登録後、翌朝に 2→3 が無人で実行される（expense_sync_log で確認）
6. 秘密情報（client_secret / service_role / cron_secret）がリポジトリに一切コミットされていない

## 6. 実装メモ

- Deno / supabase-js v2 を使用。fetch リトライ（429/5xx は指数バックオフ3回）
- MF API のページングは `metadata.total_pages` 準拠
- 金額は整数円。日付は `Asia/Tokyo` 基準（`Intl.DateTimeFormat` か手動 +9h。**UTCの Date.now() 直用禁止**）
- 既存カテゴリ名: 開発・AI / 食費 / 交通費 / 現金引出 / 習い事 / ローン / ローン保険 / オリコ /
  JCB引落 / UC引落 / SMBC引落 / ライフ引落 / yj引落 / 特別支出 / 給与 ほか
- 既存カード名: PayPay / JCB / UC / 三井住友 / ライフ
- コード内コメントは簡潔に。日本語可。
```
supabase/
  functions/
    _shared/mf.ts        # OAuth/refresh/API呼び出し
    _shared/db.ts        # service-role クライアント, ルール適用
    mf-oauth/index.ts
    mf-sync/index.ts
    morning-brief/index.ts
  migrations/20260705000000_phase2_backend.sql
docs/phase2-deploy.md    # secrets設定・デプロイ・cron登録・再認証手順（コマンド列挙）
```
