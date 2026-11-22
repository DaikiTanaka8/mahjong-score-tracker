import { describe, expect, it } from "vitest";

import { DEFAULT_SORT, nextSort, sortStats, type SortKey } from "./statsSort";
import type { PlayerStats } from "./types";

function stats(id: number, name: string, overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    player_id: id,
    name,
    games_count: 5,
    total_score: 0,
    max_points: 30000,
    avg_rank: 2.5,
    rank_counts: [1, 1, 1, 1],
    top_rate: 0.2,
    last_rate: 0.2,
    ...overrides,
  };
}

/** 対局が0件のプレイヤー */
const rookie = (id: number, name: string) =>
  stats(id, name, {
    games_count: 0,
    total_score: null,
    max_points: null,
    avg_rank: null,
    rank_counts: [0, 0, 0, 0],
    top_rate: null,
    last_rate: null,
  });

const names = (list: PlayerStats[]) => list.map((s) => s.name);

const TANAKA = stats(1, "田中", { total_score: 52.5, avg_rank: 2.1, top_rate: 0.3, last_rate: 0.07, max_points: 42500, games_count: 5 });
const SATO = stats(2, "佐藤", { total_score: 45, avg_rank: 2.0, top_rate: 0.25, last_rate: 0.08, max_points: 38000, games_count: 4 });
const SUZUKI = stats(3, "鈴木", { total_score: -48, avg_rank: 3.0, top_rate: 0.2, last_rate: 0.4, max_points: 45000, games_count: 5 });
const TAKAHASHI = stats(4, "高橋", { total_score: -76.5, avg_rank: 3.0, top_rate: 0.2, last_rate: 0.47, max_points: 33000, games_count: 5 });

describe("DEFAULT_SORT", () => {
  it("最初は、通算スコアの高い順", () => {
    expect(DEFAULT_SORT).toEqual({ key: "total_score", direction: "desc" });
  });
});

describe("nextSort", () => {
  it("同じ項目をもう一度押すと、昇順と降順が入れ替わる", () => {
    const first = nextSort(DEFAULT_SORT, "total_score");
    const second = nextSort(first, "total_score");

    expect(first).toEqual({ key: "total_score", direction: "asc" });
    expect(second).toEqual({ key: "total_score", direction: "desc" });
  });

  it.each<[SortKey, "asc" | "desc"]>([
    ["name", "asc"], // 名前は五十音順
    ["avg_rank", "asc"], // 平均順位は、良い順(小さい順)
    ["games_count", "desc"],
    ["total_score", "desc"],
    ["top_rate", "desc"],
    ["last_rate", "desc"],
    ["max_points", "desc"],
  ])("別の項目 %s を押すと、最初は %s", (key, direction) => {
    const current = { key: "games_count" as SortKey, direction: "asc" as const };

    expect(nextSort(current, key)).toEqual({ key, direction });
  });
});

describe("sortStats", () => {
  const list = [SUZUKI, TANAKA, TAKAHASHI, SATO]; // わざとばらばらの順

  it("通算スコアの高い順", () => {
    expect(names(sortStats(list, { key: "total_score", direction: "desc" }))).toEqual([
      "田中", "佐藤", "鈴木", "高橋",
    ]); // fmt: skip
  });

  it("通算スコアの低い順", () => {
    expect(names(sortStats(list, { key: "total_score", direction: "asc" }))).toEqual([
      "高橋", "鈴木", "佐藤", "田中",
    ]); // fmt: skip
  });

  it("平均順位の良い順(小さい順)。同じ値は、プレイヤーIDの順", () => {
    expect(names(sortStats(list, { key: "avg_rank", direction: "asc" }))).toEqual([
      "佐藤", "田中", "鈴木", "高橋",
    ]); // fmt: skip
  });

  it("トップ率の高い順", () => {
    expect(names(sortStats(list, { key: "top_rate", direction: "desc" }))[0]).toBe("田中");
  });

  it("ラス率の高い順", () => {
    expect(names(sortStats(list, { key: "last_rate", direction: "desc" }))).toEqual([
      "高橋", "鈴木", "佐藤", "田中",
    ]); // fmt: skip
  });

  it("最高素点の高い順", () => {
    expect(names(sortStats(list, { key: "max_points", direction: "desc" }))).toEqual([
      "鈴木", "田中", "佐藤", "高橋",
    ]); // fmt: skip
  });

  it("対局数の多い順。同じ値は、プレイヤーIDの順", () => {
    expect(names(sortStats(list, { key: "games_count", direction: "desc" }))).toEqual([
      "田中", "鈴木", "高橋", "佐藤",
    ]); // fmt: skip
  });

  it("名前は、かな(ひらがな・カタカナ)は五十音順に並ぶ", () => {
    const people = [stats(1, "さとう"), stats(2, "あべ"), stats(3, "タナカ"), stats(4, "かとう")];

    expect(names(sortStats(people, { key: "name", direction: "asc" }))).toEqual([
      "あべ", "かとう", "さとう", "タナカ",
    ]); // fmt: skip
  });

  it("名前の漢字は、読みではなく文字コードの順に並ぶ(パソコンには読みがわからないため)", () => {
    const people = [stats(1, "鈴木"), stats(2, "田中")];

    // 読みの順なら「すずき」→「たなか」だが、文字コードの順は「田」→「鈴」
    expect(names(sortStats(people, { key: "name", direction: "asc" }))).toEqual(["田中", "鈴木"]);
  });

  it("名前の降順は、逆の並び", () => {
    const people = [stats(1, "あべ"), stats(2, "さとう"), stats(3, "かとう")];

    expect(names(sortStats(people, { key: "name", direction: "desc" }))).toEqual([
      "さとう", "かとう", "あべ",
    ]); // fmt: skip
  });

  it("元の配列は変えない", () => {
    const before = names(list);

    sortStats(list, { key: "total_score", direction: "asc" });

    expect(names(list)).toEqual(before);
  });
});

describe("対局が0件のプレイヤー", () => {
  const list = [rookie(5, "新人"), TANAKA, SUZUKI];

  it.each(["desc", "asc"] as const)("通算スコアで並べても(%s)、いつも最後", (direction) => {
    const sorted = sortStats(list, { key: "total_score", direction });

    expect(names(sorted).at(-1)).toBe("新人");
  });

  it.each([
    "avg_rank",
    "top_rate",
    "last_rate",
    "max_points",
  ] as const)("%s で並べても、いつも最後", (key) => {
    expect(names(sortStats(list, { key, direction: "asc" })).at(-1)).toBe("新人");
    expect(names(sortStats(list, { key, direction: "desc" })).at(-1)).toBe("新人");
  });

  it("対局数で並べるときは、0 として普通に並ぶ", () => {
    expect(names(sortStats(list, { key: "games_count", direction: "asc" }))[0]).toBe("新人");
  });

  it("0件のプレイヤーが複数いるときは、プレイヤーIDの順", () => {
    const sorted = sortStats([rookie(7, "新人B"), TANAKA, rookie(6, "新人A")], DEFAULT_SORT);

    expect(names(sorted)).toEqual(["田中", "新人A", "新人B"]);
  });
});
