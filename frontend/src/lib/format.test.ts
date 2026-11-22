import { describe, expect, it } from "vitest";

import {
  comma,
  formatAvgRank,
  formatCountFixed,
  formatPercent,
  formatScore,
  formatTrimmed,
  scoreClass,
} from "./format";

// 期待値は docs/画面設計.md「4. 表示のルール」の例

describe("comma(素点の3桁区切り)", () => {
  it("3桁ごとにカンマを入れる", () => {
    expect(comma(42500)).toBe("42,500");
    expect(comma(120000)).toBe("120,000");
  });

  it("3桁以下はそのまま", () => {
    expect(comma(900)).toBe("900");
    expect(comma(0)).toBe("0");
  });

  it("マイナスの素点(トビ)にも対応する", () => {
    expect(comma(-3000)).toBe("-3,000");
  });
});

describe("formatScore(スコア)", () => {
  it("プラスには「+」をつけて、小数第1位まで表示する", () => {
    expect(formatScore(42.5)).toBe("+42.5");
    expect(formatScore(11)).toBe("+11.0");
  });

  it("マイナスには「−」(マイナス記号)をつける", () => {
    expect(formatScore(-12)).toBe("−12.0");
    expect(formatScore(-41.5)).toBe("−41.5");
  });

  it("0 には符号をつけない", () => {
    expect(formatScore(0)).toBe("0.0");
    expect(formatScore(-0)).toBe("0.0");
  });

  it("ハイフンではなくマイナス記号(−)を使う", () => {
    expect(formatScore(-1)).not.toContain("-");
    expect(formatScore(-1)).toContain("−");
  });
});

describe("scoreClass(スコアの色)", () => {
  it("プラスは青(plus)、マイナスは赤(minus)、0 は色なし", () => {
    expect(scoreClass(0.1)).toBe("plus");
    expect(scoreClass(-0.1)).toBe("minus");
    expect(scoreClass(0)).toBe("");
  });
});

describe("formatTrimmed(順位・順位の回数)", () => {
  it("整数のときは整数で表示する", () => {
    expect(formatTrimmed(1)).toBe("1");
    expect(formatTrimmed(4)).toBe("4");
    expect(formatTrimmed(0)).toBe("0");
  });

  it("同点の順位は小数のまま", () => {
    expect(formatTrimmed(1.5)).toBe("1.5");
    expect(formatTrimmed(3.5)).toBe("3.5");
  });

  it("3人同点の 1/3 は小数第2位までにする", () => {
    expect(formatTrimmed(1 / 3)).toBe("0.33");
    expect(formatTrimmed(11 / 6)).toBe("1.83");
    expect(formatTrimmed(7 / 3)).toBe("2.33");
  });

  it("分数の足し算の誤差が残っても、整数として表示する", () => {
    expect(formatTrimmed(0.9999999999999999)).toBe("1");
  });
});

describe("formatAvgRank(平均順位)", () => {
  it("小数第2位まで表示する", () => {
    expect(formatAvgRank(2.21)).toBe("2.21");
    expect(formatAvgRank(2.1)).toBe("2.10");
    expect(formatAvgRank(3)).toBe("3.00");
  });
});

describe("formatCountFixed(成績一覧の順位の回数)", () => {
  it("小数点の位置が揃うよう、常に小数第2位まで表示する", () => {
    expect(formatCountFixed(4)).toBe("4.00");
    expect(formatCountFixed(1.5)).toBe("1.50");
    expect(formatCountFixed(1 / 3)).toBe("0.33");
    expect(formatCountFixed(0)).toBe("0.00");
  });
});

describe("formatPercent(トップ率・ラス率)", () => {
  it("パーセントで、小数第1位まで表示する", () => {
    expect(formatPercent(1 / 3)).toBe("33.3%");
    expect(formatPercent(0.3)).toBe("30.0%");
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });
});
