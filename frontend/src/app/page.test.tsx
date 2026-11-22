// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api";
import type { PlayerStats } from "@/lib/types";

import StatsPage from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, listStats: vi.fn() };
});

const listStats = vi.mocked(api.listStats);

// 画面設計のモックと同じサンプル(API が返す形。並びは ID の順)
const STATS: PlayerStats[] = [
  {
    player_id: 1, name: "田中", games_count: 5, total_score: 52.5, max_points: 42500,
    avg_rank: 2.1, rank_counts: [1.5, 11 / 6, 4 / 3, 1 / 3], top_rate: 0.3, last_rate: 1 / 15,
  },
  {
    player_id: 2, name: "佐藤", games_count: 4, total_score: 45, max_points: 38000,
    avg_rank: 2.0, rank_counts: [1, 7 / 3, 1 / 3, 1 / 3], top_rate: 0.25, last_rate: 1 / 12,
  },
  {
    player_id: 3, name: "鈴木", games_count: 5, total_score: -48, max_points: 45000,
    avg_rank: 3.0, rank_counts: [1, 0, 2, 2], top_rate: 0.2, last_rate: 0.4,
  },
  {
    player_id: 4, name: "高橋", games_count: 5, total_score: -76.5, max_points: 33000,
    avg_rank: 3.0, rank_counts: [1, 1 / 3, 4 / 3, 7 / 3], top_rate: 0.2, last_rate: 7 / 15,
  },
  {
    player_id: 5, name: "新人", games_count: 0, total_score: null, max_points: null,
    avg_rank: null, rank_counts: [0, 0, 0, 0], top_rate: null, last_rate: null,
  },
]; // fmt: skip

/** 表の本体の行を、画面に出ている順に、セルの文字の配列にして返す */
function bodyRows() {
  const [, body] = screen.getAllByRole("rowgroup"); // 1つ目は見出し(thead)、2つ目が本体(tbody)
  return within(body)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
}

const namesInOrder = () => bodyRows().map((cells) => cells[0]);

/** リンクの行き先(パスと id)。末尾のスラッシュの有無は区別しない */
function target(link: HTMLElement) {
  const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
  return { pathname: url.pathname.replace(/\/$/, ""), id: url.searchParams.get("id") };
}

beforeEach(() => {
  listStats.mockResolvedValue(STATS);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("表の内容", () => {
  it("名前・対局数・通算スコア・平均順位・順位の回数(1〜4位)・トップ率・ラス率・最高素点を表示する", async () => {
    renderStats();
    await screen.findByText("田中");

    const tanaka = bodyRows().find((cells) => cells[0] === "田中");
    expect(tanaka).toEqual([
      "田中", "5", "+52.5", "2.10", "1.50", "1.83", "1.33", "0.33", "30.0%", "6.7%", "42,500",
    ]); // fmt: skip
  });

  it("順位の回数は、1位〜4位を別々の列にし、小数第2位まで固定で表示する(小数点がそろう)", async () => {
    renderStats();
    await screen.findByText("田中");

    const sato = bodyRows().find((cells) => cells[0] === "佐藤");
    expect(sato?.slice(4, 8)).toEqual(["1.00", "2.33", "0.33", "0.33"]);
    expect(screen.getByText("順位の回数")).toBeTruthy();
    for (const rank of ["1位", "2位", "3位", "4位"]) {
      expect(screen.getByRole("columnheader", { name: rank })).toBeTruthy();
    }
  });

  it("スコアは、プラスが青、マイナスが赤", async () => {
    renderStats();
    await screen.findByText("田中");

    expect(screen.getByText("+52.5").className).toContain("plus");
    expect(screen.getByText("−48.0").className).toContain("minus");
  });

  it("対局が0件のプレイヤーは、対局数は 0、ほかは「-」", async () => {
    renderStats();
    await screen.findByText("田中");

    const rookie = bodyRows().find((cells) => cells[0] === "新人");
    expect(rookie).toEqual(["新人", "0", "-", "-", "-", "-", "-", "-", "-", "-", "-"]);
  });

  it("名前は、そのプレイヤーの詳細へのリンク", async () => {
    renderStats();

    const link = await screen.findByRole("link", { name: "鈴木" });

    expect(target(link)).toEqual({ pathname: "/players/detail", id: "3" });
  });

  it("「＋ 対局を登録する」ボタンがある", async () => {
    renderStats();

    const link = await screen.findByRole("link", { name: "＋ 対局を登録する" });

    expect(target(link).pathname).toBe("/games/new");
  });
});

describe("並び替え", () => {
  it("最初は、通算スコアの高い順(対局が0件のプレイヤーは最後)", async () => {
    renderStats();
    await screen.findByText("田中");

    expect(namesInOrder()).toEqual(["田中", "佐藤", "鈴木", "高橋", "新人"]);
    expect(sortHeader("通算スコア").getAttribute("aria-sort")).toBe("descending");
    expect(screen.getByRole("button", { name: "通算スコア ▼" })).toBeTruthy();
  });

  it("同じ項目をもう一度押すと、昇順と降順が入れ替わる(0件のプレイヤーは最後のまま)", async () => {
    const user = userEvent.setup();
    renderStats();
    await screen.findByText("田中");

    await user.click(screen.getByRole("button", { name: /通算スコア/ }));
    expect(namesInOrder()).toEqual(["高橋", "鈴木", "佐藤", "田中", "新人"]);
    expect(sortHeader("通算スコア").getAttribute("aria-sort")).toBe("ascending");

    await user.click(screen.getByRole("button", { name: /通算スコア/ }));
    expect(namesInOrder()).toEqual(["田中", "佐藤", "鈴木", "高橋", "新人"]);
  });

  it("平均順位を押すと、良い順(小さい順)に並ぶ", async () => {
    const user = userEvent.setup();
    renderStats();
    await screen.findByText("田中");

    await user.click(screen.getByRole("button", { name: "平均順位" }));

    expect(namesInOrder()).toEqual(["佐藤", "田中", "鈴木", "高橋", "新人"]);
    expect(sortHeader("平均順位").getAttribute("aria-sort")).toBe("ascending");
  });

  it("トップ率を押すと、高い順に並ぶ。通算スコアの印は消える", async () => {
    const user = userEvent.setup();
    renderStats();
    await screen.findByText("田中");

    await user.click(screen.getByRole("button", { name: "トップ率" }));

    expect(namesInOrder().slice(0, 2)).toEqual(["田中", "佐藤"]);
    expect(sortHeader("通算スコア").getAttribute("aria-sort")).toBe("none");
    expect(screen.getByRole("button", { name: "トップ率 ▼" })).toBeTruthy();
  });

  it("ラス率を押すと、高い順に並ぶ", async () => {
    const user = userEvent.setup();
    renderStats();
    await screen.findByText("田中");

    await user.click(screen.getByRole("button", { name: "ラス率" }));

    expect(namesInOrder()).toEqual(["高橋", "鈴木", "佐藤", "田中", "新人"]);
  });

  it("最高素点を押すと、高い順に並ぶ", async () => {
    const user = userEvent.setup();
    renderStats();
    await screen.findByText("田中");

    await user.click(screen.getByRole("button", { name: "最高素点" }));

    expect(namesInOrder()).toEqual(["鈴木", "田中", "佐藤", "高橋", "新人"]);
  });

  it("対局数を押すと、多い順に並ぶ(0件のプレイヤーは 0 として並ぶ)", async () => {
    const user = userEvent.setup();
    renderStats();
    await screen.findByText("田中");

    await user.click(screen.getByRole("button", { name: "対局数" }));

    expect(namesInOrder()).toEqual(["田中", "鈴木", "高橋", "佐藤", "新人"]);
  });

  it("名前を押すと、名前の順に並ぶ", async () => {
    const user = userEvent.setup();
    renderStats();
    await screen.findByText("田中");

    await user.click(screen.getByRole("button", { name: "名前" }));

    // 漢字は文字コードの順(読みの順ではない)。かなの「新人」の漢字も同じ扱い
    expect(namesInOrder()).toEqual([...namesInOrder()].sort((a, b) => a.localeCompare(b, "ja")));
  });
});

describe("表示の状態", () => {
  it("読み込み中は、その旨を表示する", () => {
    listStats.mockReturnValue(new Promise(() => {}));

    renderStats();

    expect(screen.getByText("読み込み中...")).toBeTruthy();
  });

  it("プレイヤーがいないときは、案内を表示する(プレイヤー管理へのリンクつき)", async () => {
    listStats.mockResolvedValue([]);

    renderStats();

    expect(await screen.findByText(/プレイヤーが登録されていません/)).toBeTruthy();
    expect(target(screen.getByRole("link", { name: "プレイヤー管理で登録する" })).pathname).toBe(
      "/players",
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("取得に失敗したときは、エラーを表示し、再読み込みで取得し直せる", async () => {
    listStats.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_MESSAGE));
    const user = userEvent.setup();
    renderStats();

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "再読み込み" }));

    expect(await screen.findByText("田中")).toBeTruthy();
    expect(listStats).toHaveBeenCalledTimes(2);
  });
});

function renderStats() {
  return render(<StatsPage />);
}

/** 項目名の見出しのセル(aria-sort をもつ) */
function sortHeader(label: string) {
  return screen.getByRole("columnheader", { name: new RegExp(label) });
}
