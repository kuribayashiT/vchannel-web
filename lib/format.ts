/**
 * 数値の表示用フォーマッタ。
 * 1万以上は「1.2万」「3.4億」のように短縮表記する。
 */

const MAN = 10_000;
const OKU = 100_000_000;

/** 小数 1 桁（100 以上は整数）に丸め、末尾の .0 を除去する */
function trimUnit(v: number): { text: string; value: number } {
  const abs = Math.abs(v);
  const rounded = abs < 100 ? Math.round(v * 10) / 10 : Math.round(v);
  const text = abs < 100 ? rounded.toFixed(1).replace(/\.0$/, "") : String(rounded);
  return { text, value: rounded };
}

/** 通常の桁区切り表記（例: 12,345） */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("ja-JP");
}

/** 短縮表記（例: 9,999 / 1.2万 / 123万 / 1.5億） */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= OKU) {
    return `${trimUnit(n / OKU).text}億`;
  }
  if (abs >= MAN) {
    const man = trimUnit(n / MAN);
    // 丸めた結果が 10000 万に達する場合は億に繰り上げる
    if (Math.abs(man.value) >= MAN) {
      return `${trimUnit(n / OKU).text}億`;
    }
    return `${man.text}万`;
  }
  return formatNumber(n);
}
