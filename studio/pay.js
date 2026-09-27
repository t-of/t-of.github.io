// 給料（トークンを金額に換算するだけ）。API で使ったときの単価による換算で、サブスクなら実際の請求ではない。
// 単価は 100 万トークンあたりのドル（入力/出力）。キャッシュ読み込み = 入力単価×0.1、キャッシュ書き込み = 入力単価×1.25
export const PRICES = {
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};
const USD_JPY = 150;

// モデル名の [1m] や日付（-20251001）などの飾りを外して単価表を引く
const priceOf = (model) => PRICES[String(model || '').replace(/\[.*?\]/g, '').trim().replace(/-\d{8}$/, '')];

// 1 件ぶんの tokens（input/output/cacheRead/cacheWrite）→ 円。知らないモデルは null（「不明」として扱う）
export function payYen(model, tokens) {
  const p = priceOf(model);
  if (!p || !tokens) return null;
  const usd = ((tokens.input || 0) * p.in + (tokens.output || 0) * p.out
    + (tokens.cacheRead || 0) * p.in * 0.1 + (tokens.cacheWrite || 0) * p.in * 1.25) / 1e6;
  return usd * USD_JPY;
}

// 台帳の行（複数）の合計。知らないモデルの行があれば unknown に数える
export function payForRows(rows) {
  let yen = 0, unknown = 0;
  for (const r of rows) {
    const y = payYen(r.model, r.tokens);
    if (y == null) unknown++; else yen += y;
  }
  return { yen, unknown };
}

export const fmtYen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
