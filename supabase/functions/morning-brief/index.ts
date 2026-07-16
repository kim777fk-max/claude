// supabase/functions/morning-brief/index.ts
// cron: 毎日 07:00 JST（= 22:00 UTC 前日）。認可: ヘッダ x-cron-secret == CRON_SECRET のときだけ実行。
// Supabaseから読むだけ（MFには触れない）。計算はアプリ computeYear/buildDailyProjection と同等の定義を
// この関数内に自前実装する（仕様書§3.3）。
import {
  createServiceClient,
  todayJST,
  addDaysJST,
  weekdayJP,
  yen,
  sgnYen,
  upsertBriefing,
  type Severity,
} from "../_shared/db.ts";

interface Txn {
  txn_date: string;
  amount: number;
  direction: "expense" | "income";
  payment_type: "card" | "bank" | "cash";
  card_id: number | null;
  description: string | null;
}

const isBalancePay = (pt: string) => pt === "cash" || pt === "bank";
const isPlanned = (desc: string | null) => (desc || "").startsWith("予定");
const isSpecial = (desc: string | null) => (desc || "").startsWith("特別");

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("unauthorized", { status: 401 });
  }
  const userId = Deno.env.get("APP_USER_ID");
  if (!userId) return new Response("APP_USER_ID が未設定です", { status: 500 });

  const db = createServiceClient();

  try {
    const today = todayJST(); // "YYYY-MM-DD"（Asia/Tokyo基準）
    const year = Number(today.slice(0, 4));
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const currentYM = today.slice(0, 7);

    const [
      { data: ys, error: yse },
      { data: txnsRaw, error: te },
      { data: cards, error: ce },
      { data: limits, error: le },
    ] = await Promise.all([
      db.from("expense_year_settings").select("opening_balance,min_balance").eq("user_id", userId).eq("year", year).maybeSingle(),
      db
        .from("expense_transactions")
        .select("txn_date,amount,direction,payment_type,card_id,description")
        .eq("user_id", userId)
        .gte("txn_date", yearStart)
        .lte("txn_date", yearEnd)
        .order("txn_date"),
      db.from("expense_cards").select("id,name").eq("user_id", userId).eq("is_active", true).order("sort_order"),
      db.from("expense_card_limits").select("card_id,year_month,limit_amount").eq("year_month", currentYM),
    ]);
    if (yse) throw yse;
    if (te) throw te;
    if (ce) throw ce;
    if (le) throw le;

    const openingBalance = Number(ys?.opening_balance ?? 0);
    const safetyLine = Number(ys?.min_balance ?? 0);
    const txns = (txnsRaw ?? []) as Txn[];

    // ---- 現在残高 = opening_balance + 今日までの cash/bank 実績純額（「予定：」は除く） ----
    let currentBalance = openingBalance;
    for (const t of txns) {
      if (!isBalancePay(t.payment_type)) continue;
      if (t.txn_date > today) continue;
      if (isPlanned(t.description)) continue;
      currentBalance += t.direction === "income" ? Number(t.amount) : -Number(t.amount);
    }

    // ---- 前日比 = 本日の実績純額 ----
    let todayNet = 0;
    for (const t of txns) {
      if (!isBalancePay(t.payment_type)) continue;
      if (t.txn_date !== today) continue;
      if (isPlanned(t.description)) continue;
      todayNet += t.direction === "income" ? Number(t.amount) : -Number(t.amount);
    }

    // ---- 今日の予定 = 今日日付の「予定：」行（cash/bank） ----
    const todayPlans = txns.filter(
      (t) => isBalancePay(t.payment_type) && t.txn_date === today && isPlanned(t.description),
    );

    // ---- カード自由枠 = 月上限 − 今月実績（予定/特別を除く） − 今月の予定：（カード別） ----
    const limitByCard = new Map<number, number>();
    (limits ?? []).forEach((l: { card_id: number; limit_amount: number }) => limitByCard.set(l.card_id, Number(l.limit_amount)));
    const cardFree: { name: string; free: number }[] = [];
    for (const c of (cards ?? []) as { id: number; name: string }[]) {
      if (!limitByCard.has(c.id)) continue; // 上限未設定のカードは自由枠に表示しない
      const limit = limitByCard.get(c.id)!;
      let actual = 0;
      let planned = 0;
      for (const t of txns) {
        if (t.direction !== "expense" || t.payment_type !== "card" || t.card_id !== c.id) continue;
        if (t.txn_date.slice(0, 7) !== currentYM) continue;
        if (isSpecial(t.description)) continue;
        if (isPlanned(t.description)) planned += Number(t.amount);
        else actual += Number(t.amount);
      }
      cardFree.push({ name: c.name, free: limit - actual - planned });
    }

    // ---- 最低残高予測 = 今日残高から年末まで日次ウォーク（cash/bankの予定・実績を日付順に適用） ----
    const dayNet = new Map<string, number>();
    for (const t of txns) {
      if (!isBalancePay(t.payment_type)) continue;
      if (t.txn_date < today) continue; // 過去は既にcurrentBalanceへ反映済み
      if (t.txn_date === today && !isPlanned(t.description)) continue; // 今日の実績も反映済み（今日の予定のみ以降のウォークに使う）
      const amt = t.direction === "income" ? Number(t.amount) : -Number(t.amount);
      dayNet.set(t.txn_date, (dayNet.get(t.txn_date) || 0) + amt);
    }
    let walkBal = currentBalance;
    let minBal = currentBalance;
    let minDate = today;
    for (let d = today; d <= yearEnd; d = addDaysJST(d, 1)) {
      const net = dayNet.get(d) || 0;
      walkBal += net;
      if (walkBal < minBal) {
        minBal = walkBal;
        minDate = d;
      }
    }

    // ---- 文面組み立て ----
    const md = (dateStr: string) => `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}`;
    const title = `☀️ 丸くん朝礼 ${md(today)}(${weekdayJP(today)})`;

    const balLine = `💰 残高 ${yen(currentBalance)}（前日比 ${sgnYen(todayNet)}）`;

    const planLine = todayPlans.length
      ? `📅 今日の予定: ${todayPlans
          .map((t) => `${t.description || "(内容なし)"} ${yen(t.direction === "income" ? Number(t.amount) : -Number(t.amount))}`)
          .join("、")}`
      : `📅 今日の予定: なし`;

    const cardLine = cardFree.length
      ? `💳 自由枠: ${cardFree.map((c) => `${c.name} ${yen(c.free)}`).join(" / ")}`
      : `💳 自由枠: カード上限が未設定です`;

    let minLineText: string;
    if (minBal < 0) {
      minLineText = `📉 年内の底: ${md(minDate)} ${yen(minBal)}（🚨 残高がマイナスになる予測。安全ライン ${yen(safetyLine)}）`;
    } else if (minBal < safetyLine) {
      minLineText = `📉 年内の底: ${md(minDate)} ${yen(minBal)}（⚠ 安全ライン ${yen(safetyLine)} 割れ）`;
    } else {
      minLineText = `📉 年内の底: ${md(minDate)} ${yen(minBal)}（安全ライン ${yen(safetyLine)} 以上）`;
    }

    const body = [title, balLine, planLine, cardLine, minLineText].join("\n");

    let severity: Severity = "ok";
    if (minBal < 0) severity = "alert";
    else if (minBal < safetyLine) severity = "warn";
    if (severity === "ok" && cardFree.some((c) => c.free < 0)) severity = "warn";

    await upsertBriefing(db, userId, today, "morning", title, body, severity);

    return new Response(JSON.stringify({ ok: true, severity, currentBalance, minBal, minDate }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = (e as Error).message || String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
