// 成績一覧(S01)の並び替え(docs/画面設計.md 3.1)。
// 画面から切り離した関数にして、単体でテストできるようにしている。

import type { PlayerStats } from "./types";

export type SortKey =
  | "name"
  | "games_count"
  | "total_score"
  | "avg_rank"
  | "top_rate"
  | "last_rate"
  | "max_points";

export type SortDirection = "asc" | "desc";
export type SortState = { key: SortKey; direction: SortDirection };

/** 最初の並び順: 通算スコアの高い順 */
export const DEFAULT_SORT: SortState = { key: "total_score", direction: "desc" };

/**
 * 項目名を押したときの、次の並び順。
 * - 今の項目をもう一度押したら、昇順と降順を入れ替える
 * - 別の項目を押したら、その項目の「いちばん見たい向き」から始める
 *   (名前は昇順、平均順位は良い順(小さい順)、それ以外は大きい順)
 *   ※名前の並びは、かなは五十音順。漢字は、読みではなく文字コードの順(読みの情報がないため)
 */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: key === "name" || key === "avg_rank" ? "asc" : "desc" };
}

type Comparable = string | number | null;

function valueOf(stats: PlayerStats, key: SortKey): Comparable {
  // 対局が0件のプレイヤーは、対局数と名前以外の項目に、比べる値がない
  switch (key) {
    case "name":
      return stats.name;
    case "games_count":
      return stats.games_count;
    default:
      return stats[key];
  }
}

/** 並び替えた新しい配列を返す(元の配列は変えない) */
export function sortStats(list: PlayerStats[], sort: SortState): PlayerStats[] {
  const sign = sort.direction === "asc" ? 1 : -1;

  return [...list].sort((a, b) => {
    const x = valueOf(a, sort.key);
    const y = valueOf(b, sort.key);

    // 比べる値がない(対局が0件の)プレイヤーは、向きに関係なく最後に置く
    if (x === null && y === null) return a.player_id - b.player_id;
    if (x === null) return 1;
    if (y === null) return -1;

    const order =
      typeof x === "string" && typeof y === "string"
        ? x.localeCompare(y, "ja")
        : (x as number) - (y as number);
    // 同じ値のときは、プレイヤーIDの順(いつも同じ並びになる)
    return order !== 0 ? order * sign : a.player_id - b.player_id;
  });
}
