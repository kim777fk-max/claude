// supabase/functions/mf-sync/index.ts
// cron: 毎日 06:45 JST（= 21:45 UTC 前日）。認可: ヘッダ x-cron-secret == CRON_SECRET のときだけ実行。
// 1. refreshIfNeeded()
// 2. 直近14日分の仕訳を MF API GET /journals からページング全件取得
// 3. 既存データと同じ変換規約で expense_transactions 用レコードへ変換
// 4. expense_transactions へ upsert（on_conflict=user_id,external_id、merge）
// 5. expense_sync_log に結果を insert
import { createServiceClient, todayJST, addDaysJST, loadActiveRules, firstMatchingRule, loadNameMaps, insertSyncLog, type SyncRule } from "../_shared/db.ts";
import { refreshIfNeeded, fetchAllJournals, type MfJournal } from "../_shared/mf.ts";

const SYNC_DAYS = 14;

type Direction = "expense" | "income";
type PaymentType = "card" | "bank" | "cash";

interface Classified {
  direction: Direction;
  payment_type: PaymentType;
  subAccountForCard: string | null;
}

// 借方/貸方の勘定科目名から実際の会計処理を推定する。
// 仕様書§3.2の変換規約に基づく判定（複式簿記の一般原則: 資産科目（普通預金/現金）は
// 借方＝増加(入金)・貸方＝減少(出金)、未払金は負債科目で貸方＝増加＝カード利用の記帳）。
const REVENUE_RE = /(売上|収益|給与|報酬)/;
const BANK_RE = /普通預金/;
const CASH_RE = /現金/;
const UNPAID_RE = /未払金/;
// 仕様書にある「期首仕訳」判定文字列
const OPENING_RE = /OPENING/i;

function classify(j: MfJournal): Classified | null {
  const debits = j.debits ?? [];
  const credits = j.credits ?? [];
  const debitNames = debits.map((d) => d.account_item_name || "");
  const creditNames = credits.map((c) => c.account_item_name || "");
  const allNames = [...debitNames, ...creditNames];

  const debitIsBank = debitNames.some((n) => BANK_RE.test(n));
  const debitIsRevenue = debitNames.some((n) => REVENUE_RE.test(n));

  if (debitIsBank || debitIsRevenue) {
    // 借方が売上高等の収益、または普通預金が借方 → 収入
    if (allNames.some((n) => BANK_RE.test(n))) {
      return { direction: "income", payment_type: "bank", subAccountForCard: null };
    }
    if (allNames.some((n) => CASH_RE.test(n))) {
      return { direction: "income", payment_type: "cash", subAccountForCard: null };
    }
    // 現金/口座科目が見当たらない収益仕訳は口座扱い（要確認: 実データで再検証すること）
    return { direction: "income", payment_type: "bank", subAccountForCard: null };
  }

  // 借方が費用系（デフォルト） → 支出
  const unpaidCredit = credits.find((c) => UNPAID_RE.test(c.account_item_name || ""));
  if (unpaidCredit) {
    return {
      direction: "expense",
      payment_type: "card",
      subAccountForCard: unpaidCredit.sub_account_name ?? null,
    };
  }
  if (allNames.some((n) => BANK_RE.test(n))) {
    return { direction: "expense", payment_type: "bank", subAccountForCard: null };
  }
  if (allNames.some((n) => CASH_RE.test(n))) {
    return { direction: "expense", payment_type: "cash", subAccountForCard: null };
  }
  // 未払金/普通預金/現金のいずれにも該当しない仕訳（振替仕訳等）は同期対象外
  return null;
}

function journalRemark(j: MfJournal): string {
  if (j.remark) return j.remark;
  for (const d of j.debits ?? []) if (d.description) return d.description;
  for (const c of j.credits ?? []) if (c.description) return c.description;
  return "";
}

function journalAmount(j: MfJournal): number {
  const sum = (j.debits ?? []).reduce((s, d) => s + Math.abs(Number(d.amount) || 0), 0);
  if (sum > 0) return sum;
  return (j.credits ?? []).reduce((s, c) => s + Math.abs(Number(c.amount) || 0), 0);
}

interface TxnRecord {
  user_id: string;
  external_id: string;
  txn_date: string;
  amount: number;
  direction: Direction;
  payment_type: PaymentType;
  category_id: number | null;
  card_id: number | null;
  description: string | null;
  source: string;
}

function convertJournal(
  j: MfJournal,
  userId: string,
  remarkRules: SyncRule[],
  subAccountRules: SyncRule[],
  categoryIdByName: Map<string, number>,
  cardIdByName: Map<string, number>,
): TxnRecord | null {
  if (OPENING_RE.test(j.journal_type ?? "")) return null; // 期首仕訳はスキップ

  const classified = classify(j);
  if (!classified) return null;

  const amount = journalAmount(j);
  if (!amount) return null;

  const rawRemark = journalRemark(j);
  const remarkRule = firstMatchingRule(remarkRules, rawRemark);
  const categoryId = remarkRule?.category_name
    ? categoryIdByName.get(remarkRule.category_name) ?? null
    : null;
  const markSpecial = remarkRule?.mark_special ?? false;
  const description = (markSpecial ? "特別：" : "") + rawRemark;

  let cardId: number | null = null;
  if (classified.payment_type === "card") {
    const subAccountText = classified.subAccountForCard ?? "";
    const subRule = firstMatchingRule(subAccountRules, subAccountText);
    if (subRule?.card_name) cardId = cardIdByName.get(subRule.card_name) ?? null;
  }

  // URLデコードした生ID
  const rawId = decodeURIComponent(String(j.id));

  return {
    user_id: userId,
    external_id: `mfca:${rawId}`,
    txn_date: (j.transaction_date || "").slice(0, 10),
    amount,
    direction: classified.direction,
    payment_type: classified.payment_type,
    category_id: categoryId,
    card_id: cardId,
    description: description || null,
    source: "mf-api",
  };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("unauthorized", { status: 401 });
  }
  const userId = Deno.env.get("APP_USER_ID");
  if (!userId) return new Response("APP_USER_ID が未設定です", { status: 500 });

  const db = createServiceClient();

  try {
    const refresh = await refreshIfNeeded(db, userId);
    if (!refresh.ok || !refresh.accessToken) {
      await insertSyncLog(db, userId, false, 0, "MFトークンのrefreshに失敗。再認証が必要です（expense_briefingsにalertを記録済み）。");
      return new Response(JSON.stringify({ ok: false, reason: "reauth_required" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const toDate = todayJST();
    const fromDate = addDaysJST(toDate, -SYNC_DAYS);

    const journals = await fetchAllJournals(refresh.accessToken, fromDate, toDate);

    const [remarkRules, subAccountRules, { categoryIdByName, cardIdByName }] = await Promise.all([
      loadActiveRules(db, userId, "remark"),
      loadActiveRules(db, userId, "sub_account"),
      loadNameMaps(db, userId),
    ]);

    const records: TxnRecord[] = [];
    let skipped = 0;
    for (const j of journals) {
      const rec = convertJournal(j, userId, remarkRules, subAccountRules, categoryIdByName, cardIdByName);
      if (rec) records.push(rec);
      else skipped++;
    }

    let insertedCount = 0;
    if (records.length) {
      // on_conflict=user_id,external_id で merge upsert（ignoreDuplicatesではなく更新も反映する）
      const { data, error } = await db
        .from("expense_transactions")
        .upsert(records, { onConflict: "user_id,external_id" })
        .select("id");
      if (error) throw error;
      insertedCount = data?.length ?? records.length;
    }

    const message = `期間 ${fromDate}〜${toDate} / 取得仕訳 ${journals.length}件 / upsert ${insertedCount}件 / 対象外 ${skipped}件`;
    await insertSyncLog(db, userId, true, insertedCount, message);

    return new Response(
      JSON.stringify({ ok: true, fromDate, toDate, fetched: journals.length, upserted: insertedCount, skipped }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    const message = (e as Error).message || String(e);
    await insertSyncLog(db, userId, false, 0, message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
