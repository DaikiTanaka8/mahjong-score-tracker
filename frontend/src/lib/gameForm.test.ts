import { describe, expect, it } from "vitest";

import {
  calcTotal,
  emptyForm,
  formFromGame,
  parsePoints,
  toGameInput,
  todayString,
  validate,
  type GameFormValues,
} from "./gameForm";
import type { Game } from "./types";

/** 正しく入力された、4人分のフォーム(合計 120,000点) */
function validForm(overrides: Partial<GameFormValues> = {}): GameFormValues {
  return {
    playedOn: "2026-11-22",
    kyotaku: "0",
    rows: [
      { playerId: "1", points: "42500" },
      { playerId: "2", points: "31000" },
      { playerId: "3", points: "28000" },
      { playerId: "4", points: "18500" },
    ],
    ...overrides,
  };
}

function withRow(index: number, row: Partial<{ playerId: string; points: string }>) {
  const form = validForm();
  form.rows[index] = { ...form.rows[index], ...row };
  return form;
}

describe("todayString", () => {
  it("パソコンの日付を YYYY-MM-DD で返す(UTC ではなく、手元の日付)", () => {
    // 日本時間の 2026-01-05 00:30(UTC では 1月4日)
    expect(todayString(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  });

  it("月と日は、2桁にそろえる", () => {
    expect(todayString(new Date(2026, 2, 9))).toBe("2026-03-09");
  });
});

describe("emptyForm", () => {
  it("今日の日付・供託0・4人分の空欄で始まる", () => {
    const form = emptyForm("2026-11-22");

    expect(form.playedOn).toBe("2026-11-22");
    expect(form.kyotaku).toBe("0");
    expect(form.rows).toEqual(Array(4).fill({ playerId: "", points: "" }));
  });
});

describe("parsePoints", () => {
  it.each([
    ["42500", 42500],
    ["-3000", -3000],
    [" 100 ", 100],
    ["0", 0],
  ])("%s は %i", (text, expected) => {
    expect(parsePoints(text)).toBe(expected);
  });

  it.each([[""], ["  "], ["abc"], ["12.5"], ["1e3"], ["--1"]])("%j は null", (text) => {
    expect(parsePoints(text)).toBeNull();
  });
});

describe("calcTotal", () => {
  it("素点の合計 + 供託 と、120,000点との差を返す", () => {
    const result = calcTotal(validForm({ kyotaku: "1000" }));

    expect(result).toEqual({ pointsSum: 120000, kyotaku: 1000, total: 121000, diff: -1000 });
  });

  it("入力が途中でも、入力済みの分だけを合計する", () => {
    const form = emptyForm("2026-11-22");
    form.rows[0].points = "42500";
    form.rows[1].points = "abc"; // 数字でないものは、合計に入れない

    expect(calcTotal(form)).toEqual({ pointsSum: 42500, kyotaku: 0, total: 42500, diff: 77500 });
  });

  it("素点がマイナス(トビ)でも合計できる", () => {
    const form = withRow(3, { points: "-3000" });
    form.rows[0].points = "50000";
    form.rows[1].points = "40000";
    form.rows[2].points = "33000";

    expect(calcTotal(form).total).toBe(120000);
  });
});

describe("validate", () => {
  it("正しい入力は、誤りなし", () => {
    expect(validate(validForm())).toEqual([]);
  });

  it("供託が残った対局(素点の合計 + 供託 = 120,000点)は、誤りなし", () => {
    const form = validForm({ kyotaku: "1000" });
    form.rows[0].points = "41500";

    expect(validate(form)).toEqual([]);
  });

  it("素点がマイナス(トビ)でも、合計が合えば誤りなし", () => {
    const form = validForm();
    form.rows[0].points = "50000";
    form.rows[1].points = "40000";
    form.rows[2].points = "33000";
    form.rows[3].points = "-3000";

    expect(validate(form)).toEqual([]);
  });

  it("対局日が空", () => {
    expect(validate(validForm({ playedOn: "" }))).toEqual(["対局日を入力してください"]);
  });

  it("プレイヤーが4人そろっていない", () => {
    expect(validate(withRow(2, { playerId: "" }))).toEqual(["4人のプレイヤーを選択してください"]);
  });

  it("同じプレイヤーを重複して選んだ", () => {
    expect(validate(withRow(1, { playerId: "1" }))).toEqual(["同じプレイヤーを重複して選べません"]);
  });

  it("素点が空欄", () => {
    expect(validate(withRow(1, { points: "" }))).toEqual(["4人分の素点を入力してください"]);
  });

  it.each([["31050"], ["12.5"], ["abc"]])("素点が100点単位でない(%s)", (points) => {
    expect(validate(withRow(1, { points }))).toEqual(["素点は100点単位で入力してください"]);
  });

  it.each([["-100"], ["50"], ["abc"], [""]])("供託が不正(%j)", (kyotaku) => {
    const errors = validate(validForm({ kyotaku }));

    expect(errors).toContain("供託は0以上の100点単位で入力してください");
  });

  it("合計が120,000点に足りない(現在の合計を示す)", () => {
    expect(validate(withRow(0, { points: "41500" }))).toEqual([
      "素点の合計と供託の合計が 120,000点になっていません(現在: 119,000点)",
    ]);
  });

  it("合計が120,000点を超える", () => {
    expect(validate(withRow(0, { points: "43500" }))).toEqual([
      "素点の合計と供託の合計が 120,000点になっていません(現在: 121,000点)",
    ]);
  });

  it("供託を足すと120,000点を超える", () => {
    expect(validate(validForm({ kyotaku: "1000" }))).toEqual([
      "素点の合計と供託の合計が 120,000点になっていません(現在: 121,000点)",
    ]);
  });

  it("素点や供託が不正なときは、合計のエラーは出さない(先に不正を直してもらう)", () => {
    const errors = validate(withRow(1, { points: "31050" }));

    expect(errors).toEqual(["素点は100点単位で入力してください"]);
  });

  it("誤りが複数あるときは、全部まとめて返す(順番は API と同じ)", () => {
    const form = withRow(1, { points: "31050" });
    form.playedOn = "";
    form.kyotaku = "50";

    expect(validate(form)).toEqual([
      "対局日を入力してください",
      "素点は100点単位で入力してください",
      "供託は0以上の100点単位で入力してください",
    ]);
  });

  it("何も入力していない新規フォームは、誤りがある", () => {
    expect(validate(emptyForm("2026-11-22"))).toEqual([
      "4人のプレイヤーを選択してください",
      "4人分の素点を入力してください",
    ]);
  });
});

describe("toGameInput", () => {
  it("API に送る形(数値)にする", () => {
    expect(toGameInput(validForm({ kyotaku: "0" }))).toEqual({
      played_on: "2026-11-22",
      kyotaku: 0,
      results: [
        { player_id: 1, points: 42500 },
        { player_id: 2, points: 31000 },
        { player_id: 3, points: 28000 },
        { player_id: 4, points: 18500 },
      ],
    });
  });
});

describe("formFromGame", () => {
  it("登録済みの対局の内容を、フォームの値にする", () => {
    const game: Game = {
      id: 5,
      played_on: "2026-11-22",
      kyotaku: 1000,
      results: [
        { player_id: 2, player_name: "佐藤", player_deleted: false, points: 38000, rank_from: 1, rank_to: 1, rank: 1, final_score: 38 },
        { player_id: 1, player_name: "田中", player_deleted: false, points: 29000, rank_from: 2, rank_to: 2, rank: 2, final_score: 9 },
        { player_id: 4, player_name: "高橋", player_deleted: false, points: 27000, rank_from: 3, rank_to: 3, rank: 3, final_score: -13 },
        { player_id: 3, player_name: "鈴木", player_deleted: false, points: 25000, rank_from: 4, rank_to: 4, rank: 4, final_score: -35 },
      ],
    };

    const form = formFromGame(game);

    expect(form.playedOn).toBe("2026-11-22");
    expect(form.kyotaku).toBe("1000");
    expect(form.rows).toEqual([
      { playerId: "2", points: "38000" },
      { playerId: "1", points: "29000" },
      { playerId: "4", points: "27000" },
      { playerId: "3", points: "25000" },
    ]);
    expect(validate(form)).toEqual([]); // 登録済みの内容は、そのまま正しい
  });
});
