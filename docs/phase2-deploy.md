# Phase 2 バックエンド デプロイ手順

対象: `supabase/migrations/20260705000000_phase2_backend.sql` ＋
`supabase/functions/{mf-oauth,mf-sync,morning-brief}`。
仕様書: `docs/phase2-backend-spec.md`。

Supabase プロジェクト: `npcyxxldrvtqrzdvrkvd`。
以下はすべて実行コマンド列挙形式。`<...>` は各自の値に置き換えること。
**秘密情報（client_secret / service_role key / CRON_SECRET）はどのコマンドもコピペしてリポジトリに貼らないこと。**

## 0. 前提

```bash
# Supabase CLI がインストール済みであること
supabase --version

# プロジェクトにログイン・リンク
supabase login
supabase link --project-ref npcyxxldrvtqrzdvrkvd
```

## 1. マイグレーション適用（DB: mf_tokens / expense_sync_rules / expense_sync_log / expense_briefings）

```bash
supabase db push
```

適用確認:

```bash
supabase db execute --sql "select table_name from information_schema.tables where table_name in ('mf_tokens','expense_sync_rules','expense_sync_log','expense_briefings');"
supabase db execute --sql "select pattern, target, card_name, category_name from expense_sync_rules order by target, priority;"
```

## 2. secrets 設定（Edge Functions 実行環境。コードに埋め込まない）

MoneyForward developers.biz.moneyforward.com のアプリ管理画面で発行した client_id / client_secret を使う。
`APP_USER_ID` はアプリ側の Supabase Auth ユーザーIDと一致させること
（本実装では `bace39c1-6105-4d0f-a3a1-3b3e81562f86` を前提に migration の seed を作成済み）。

```bash
# ランダムな CRON_SECRET を生成して控えておく（このあとcron登録・手動curlで使う）
CRON_SECRET=$(openssl rand -hex 32)
echo "CRON_SECRET=$CRON_SECRET"   # 端末にのみ表示。この値をどこにもコミットしないこと

supabase secrets set \
  MF_CLIENT_ID="<MoneyForwardで発行されたclient_id>" \
  MF_CLIENT_SECRET="<MoneyForwardで発行されたclient_secret>" \
  APP_USER_ID="bace39c1-6105-4d0f-a3a1-3b3e81562f86" \
  CRON_SECRET="$CRON_SECRET"

# MFのOAuth/APIエンドポイントを既定値から変更する必要がある場合のみ（通常は不要）
# supabase secrets set MF_AUTH_URL="https://..." MF_TOKEN_URL="https://..." MF_API_BASE="https://..."

# 設定内容の確認（値そのものは表示されない）
supabase secrets list
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は Supabase が Edge Functions 実行環境に自動注入するため、
明示的な secrets set は不要。

## 3. Edge Functions デプロイ

3関数とも Supabase の標準JWT認証は使わず、`mf-oauth` はブラウザから直接アクセスし
（state に HMAC 署名を独自付与して保護）、`mf-sync` / `morning-brief` は独自ヘッダ `x-cron-secret` で保護するため、
`--no-verify-jwt` を付けてデプロイする。

```bash
supabase functions deploy mf-oauth --no-verify-jwt
supabase functions deploy mf-sync --no-verify-jwt
supabase functions deploy morning-brief --no-verify-jwt

# デプロイ済み関数の一覧確認
supabase functions list
```

## 4. 初回 OAuth 認証（人手で1回だけ）

ブラウザで以下を開き、MoneyForwardの同意画面で承認する:

```
https://npcyxxldrvtqrzdvrkvd.supabase.co/functions/v1/mf-oauth/start
```

「✅ 連携完了」の画面が出れば成功。DBに保存されたか確認:

```bash
supabase db execute --sql "select user_id, expires_at, updated_at from mf_tokens;"
```

## 5. cron 登録（pg_cron + pg_net。JST→UTC変換に注意: 06:45 JST = 21:45 UTC 前日、07:00 JST = 22:00 UTC 前日）

CRON_SECRET の値をSQLに直接書くため、**このSQLファイルはリポジトリにコミットしない**。
手順2で控えた `$CRON_SECRET` をシェル変数として使い、その場で流し込む。

```bash
# pg_cron / pg_net 拡張の有効化 + ジョブ登録を1本のSQLとして生成し、DBに直接流し込む
# （PROJECT_DB_URL は Supabase ダッシュボード > Project Settings > Database の接続文字列）
PROJECT_DB_URL="<postgresql://postgres:...@db.npcyxxldrvtqrzdvrkvd.supabase.co:5432/postgres>"

psql "$PROJECT_DB_URL" <<SQL
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'mf-sync-daily', '45 21 * * *',
  \$\$select net.http_post(
    'https://npcyxxldrvtqrzdvrkvd.supabase.co/functions/v1/mf-sync',
    headers:='{"x-cron-secret":"$CRON_SECRET"}'::jsonb
  )\$\$
);

select cron.schedule(
  'morning-brief-daily', '0 22 * * *',
  \$\$select net.http_post(
    'https://npcyxxldrvtqrzdvrkvd.supabase.co/functions/v1/morning-brief',
    headers:='{"x-cron-secret":"$CRON_SECRET"}'::jsonb
  )\$\$
);
SQL
```

登録確認:

```bash
psql "$PROJECT_DB_URL" -c "select jobname, schedule, active from cron.job where jobname in ('mf-sync-daily','morning-brief-daily');"
```

## 6. 動作確認

```bash
# mf-sync を手動起動（直近14日を同期）
curl -sS -X POST "https://npcyxxldrvtqrzdvrkvd.supabase.co/functions/v1/mf-sync" \
  -H "x-cron-secret: $CRON_SECRET"

# expense_transactions に反映されたか（既存の手動同期分と重複していないか）
supabase db execute --sql "select external_id, txn_date, amount, direction, payment_type, description from expense_transactions where source='mf-api' order by txn_date desc limit 20;"

# 同期ログ確認
supabase db execute --sql "select ran_at, ok, inserted_count, message from expense_sync_log order by ran_at desc limit 5;"

# morning-brief を手動起動
curl -sS -X POST "https://npcyxxldrvtqrzdvrkvd.supabase.co/functions/v1/morning-brief" \
  -H "x-cron-secret: $CRON_SECRET"

# 朝礼が入ったか（アプリのダッシュボードで最上部バナーとして表示される想定）
supabase db execute --sql "select brief_date, kind, severity, title from expense_briefings order by brief_date desc, kind limit 5;"

# 冪等性の確認（同じ範囲を2回叩いても行数が増えないこと）
curl -sS -X POST "https://npcyxxldrvtqrzdvrkvd.supabase.co/functions/v1/mf-sync" -H "x-cron-secret: $CRON_SECRET"
supabase db execute --sql "select count(*) from expense_transactions where source='mf-api';"
```

翌朝、cron登録後に無人で 5(mf-sync)→6(morning-brief) が走ったことは、
`expense_sync_log` / `expense_briefings` の最新行の `ran_at` / `created_at` が当日06:45〜07:00 JST頃であることで確認する。

## 7. 再認証手順（refresh_token 失効・アプリに赤バナーが出た場合）

1. アプリのダッシュボード上部に `kind='alert'` の赤バナーが出る（本文に再認証URLへのリンクを含む）。
   バナーのリンク、または直接以下を開く:
   ```
   https://npcyxxldrvtqrzdvrkvd.supabase.co/functions/v1/mf-oauth/start
   ```
2. MoneyForwardの同意画面で再度承認 →「✅ 連携完了」が出れば `mf_tokens` が更新される。
3. 復旧確認:
   ```bash
   supabase db execute --sql "select expires_at, updated_at from mf_tokens;"
   curl -sS -X POST "https://npcyxxldrvtqrzdvrkvd.supabase.co/functions/v1/mf-sync" -H "x-cron-secret: $CRON_SECRET"
   supabase db execute --sql "select ran_at, ok, message from expense_sync_log order by ran_at desc limit 1;"
   ```
4. 復旧後もアプリに古い赤バナーが残る場合は、当日分の alert 行は上書きされないため
   （`expense_briefings` は `(user_id, brief_date, kind)` unique。alertは同日中は同じ行を保持）、
   次回 `mf-sync` が正常終了しても alert 行は自動削除されない。必要なら手動で削除する:
   ```bash
   supabase db execute --sql "delete from expense_briefings where kind='alert' and brief_date=current_date;"
   ```

## 8. secrets のローテーション（CRON_SECRET を変更する場合）

```bash
NEW_CRON_SECRET=$(openssl rand -hex 32)
supabase secrets set CRON_SECRET="$NEW_CRON_SECRET"
supabase functions deploy mf-sync --no-verify-jwt
supabase functions deploy morning-brief --no-verify-jwt
supabase functions deploy mf-oauth --no-verify-jwt

# cron側のヘッダも新しい値に更新（既存ジョブを一度消してから登録し直す）
psql "$PROJECT_DB_URL" -c "select cron.unschedule('mf-sync-daily');"
psql "$PROJECT_DB_URL" -c "select cron.unschedule('morning-brief-daily');"
# → 手順5のSQLを $CRON_SECRET を $NEW_CRON_SECRET に読み替えて再実行
```
