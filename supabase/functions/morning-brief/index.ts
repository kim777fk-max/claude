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

    // ---- 日別 純額（cash/bank）を「実績が予定を上書き」で確定する ----
    // MoneyForwardの実データは約2週間遅れて届く。予測（「予定：」）の日付が過ぎた瞬間に
    // 残高計算から抜け落ちると、給料日など予測日が過ぎるたびに残高・底が壊れる。
    // そこで「予測を実績扱い」する：ある日に実績（非「予定：」）が1件でもあればその日は実績を採用し、
    // 実績がまだ無い日は予定で埋める（＝MF未着分は予測で計上、実績が届いたら自動で上書き）。
    // 同じ日に予定と実績が両方ある移行期（MF同期直後）でも、実績のみを採るので二重計上しない。
    // 現金(cash)はMFに連携されず永久に実績が来ないため、常に予定で埋まる（見込み計算）。
    const actualByDate = new Map<string, number>();
    const planByDate = new Map<string, number>();
    const hasActualByDate = new Set<string>();
    for (const t of txns) {
      if (!isBalancePay(t.payment_type)) continue;
      const amt = t.direction === "income" ? Number(t.amount) : -Number(t.amount);
      if (isPlanned(t.description)) {
        planByDate.set(t.txn_date, (planByDate.get(t.txn_date) || 0) + amt);
      } else {
        actualByDate.set(t.txn_date, (actualByDate.get(t.txn_date) || 0) + amt);
        hasActualByDate.add(t.txn_date);
      }
    }
    /** その日の確定純額：実績があれば実績、無ければ予定。 */
    const effectiveNet = (d: string): number =>
      hasActualByDate.has(d) ? (actualByDate.get(d) || 0) : (planByDate.get(d) || 0);

    // ---- 現在残高 = opening_balance + 今日までの確定純額（実績優先・未着日は予定） ----
    const allDates = new Set<string>([...actualByDate.keys(), ...planByDate.keys()]);
    let currentBalance = openingBalance;
    for (const d of allDates) {
      if (d > today) continue;
      currentBalance += effectiveNet(d);
    }

    // ---- 前日比 = 本日の確定純額 ----
    const todayNet = effectiveNet(today);

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

    // ---- 最低残高予測 = 今日残高から年末まで日次ウォーク（確定純額を日付順に適用） ----
    // currentBalance は既に今日ぶんを含むので、ウォークは翌日から。将来日は実績が無いので予定で埋まる。
    let walkBal = currentBalance;
    let minBal = currentBalance; // 今日残高も底の候補
    let minDate = today;
    for (let d = addDaysJST(today, 1); d <= yearEnd; d = addDaysJST(d, 1)) {
      walkBal += effectiveNet(d);
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
