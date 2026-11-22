// 表示の整形(docs/画面設計.md「4. 表示のルール」)

/** 素点など。3桁区切り(例: 42,500) */
export function comma(n: number): string {
  return n.toLocaleString("ja-JP");
}

/** スコア。小数第1位まで。プラスには「+」、マイナスには「−」(マイナス記号)をつける */
export function formatScore(n: number): string {
  const text = Math.abs(n).toFixed(1);
  if (n > 0) return `+${text}`;
  if (n < 0) return `−${text}`;
  return text;
}

/** スコアの色(プラスは青、マイナスは赤)用のクラス名 */
export function scoreClass(n: number): string {
  if (n > 0) return "plus";
  if (n < 0) return "minus";
  return "";
}

/** 順位・順位の回数。小数が出るときだけ小数第2位まで(例: 1、1.5、0.33) */
export function formatTrimmed(n: number): string {
  return String(parseFloat(n.toFixed(2)));
}

/** 平均順位。小数第2位まで(例: 2.21) */
export function formatAvgRank(n: number): string {
  return n.toFixed(2);
}

/** 順位の回数(成績一覧の表)。小数点の位置が揃うよう、常に小数第2位まで(例: 4.00、1.83) */
export function formatCountFixed(n: number): string {
  return n.toFixed(2);
}

/** トップ率・ラス率。パーセントで小数第1位まで(例: 33.3%) */
export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
