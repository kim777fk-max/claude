-- Phase 2 バックエンド: 自動同期＋丸くん朝礼
-- 仕様書: docs/phase2-backend-spec.md §2
-- 対象ユーザーは単一（APP_USER_ID env で指定。seed の user_id はその値を直書き）。

-- ============================================================
-- 1. mf_tokens: OAuthトークン（service_roleのみアクセス可）
--    RLSは有効化するが、ポリシーは一切作らない
--    → authenticated / anon からは行が一切見えない・書けない。service_role のみ操作可能。
-- ============================================================
create table mf_tokens (
  user_id uuid primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table mf_tokens enable row level security;

-- ============================================================
-- 2. expense_sync_rules: 同期の分類ルール
--    remark / sub_account のパターン(正規表現・case-insensitive) → カード/項目/特別フラグ
-- ============================================================
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

-- ============================================================
-- 3. expense_sync_log: 同期ログ
-- ============================================================
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

-- ============================================================
-- 4. expense_briefings: 朝礼・アラート（アプリが表示）
-- ============================================================
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

-- ============================================================
-- 5. 初期ルール seed（user_id は APP_USER_ID をリテラルで使用）
-- ============================================================
insert into expense_sync_rules (user_id, pattern, target, card_name, category_name, mark_special, priority, is_active) values
  ('bace39c1-6105-4d0f-a3a1-3b3e81562f86', '(OPENAI|ANTHROPIC|GOOGLE.?\*?CLOUD|ELEST\.IO|RENDER\.COM|GITHUB|VERCEL|SUPABASE)', 'remark', null, '開発・AI', true, 10, true),
  ('bace39c1-6105-4d0f-a3a1-3b3e81562f86', 'ライフ', 'remark', null, '食費', false, 20, true),
  ('bace39c1-6105-4d0f-a3a1-3b3e81562f86', 'Suica|JR東日本', 'remark', null, '交通費', false, 30, true),
  ('bace39c1-6105-4d0f-a3a1-3b3e81562f86', 'PayPayカード', 'sub_account', 'PayPay', null, false, 10, true),
  ('bace39c1-6105-4d0f-a3a1-3b3e81562f86', 'JCBANAJCB', 'sub_account', 'JCB', null, false, 20, true),
  ('bace39c1-6105-4d0f-a3a1-3b3e81562f86', 'LCJCB', 'sub_account', 'ライフ', null, false, 15, true),
  ('bace39c1-6105-4d0f-a3a1-3b3e81562f86', 'UCカード', 'sub_account', 'UC', null, false, 40, true),
  ('bace39c1-6105-4d0f-a3a1-3b3e81562f86', '三井住友カード', 'sub_account', '三井住友', null, false, 50, true);
