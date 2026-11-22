// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api";
import type { PlayerDetail } from "@/lib/types";

import PlayerDetailPage from "./page";

const mocks = vi.hoisted(() => ({ query: "id=1" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getPlayerDetail: vi.fn() };
});

const getPlayerDetail = vi.mocked(api.getPlayerDetail);

/** 田中さん。5対局。2戦目は、削除済みの山田さんと同点だった対局 */
const DETAIL: PlayerDetail = {
  player: { id: 1, name: "田中", deleted: false },
  stats: {
    games_count: 5,
    total_score: 52.5,
    max_points: 42500,
    avg_rank: 2.1,
    rank_counts: [1.5, 11 / 6, 4 / 3, 1 / 3],
    top_rate: 0.3,
    last_rate: 1 / 15,
  },
  history: [
    {
      game_id: 5,
      played_on: "2026-11-22",
      points: 29000,
      rank: 2,
      final_score: 9,
      table_mates: [
        { player_id: 2, name: "佐藤", deleted: false, rank: 1, points: 38000 },
        { player_id: 4, name: "高橋", deleted: false, rank: 3, points: 27000 },
        { player_id: 3, name: "鈴木", deleted: false, rank: 4, points: 25000 },
      ],
    },
    {
      game_id: 3,
      played_on: "2026-11-20",
      points: 36000,
      rank: 1.5,
      final_score: 26,
      table_mates: [
        { player_id: 5, name: "山田", deleted: true, rank: 1.5, points: 36000 },
        { player_id: 3, name: "鈴木", deleted: false, rank: 3, points: 28000 },
        { player_id: 4, name: "高橋", deleted: false, rank: 4, points: 20000 },
      ],
    },
    {
      game_id: 1,
      played_on: "2026-11-10",
      points: 30000,
      rank: 3,
      final_score: -10,
      table_mates: [
        { player_id: 4, name: "高橋", deleted: false, rank: 1, points: 33000 },
        { player_id: 2, name: "佐藤", deleted: false, rank: 2, points: 31000 },
        { player_id: 3, name: "鈴木", deleted: false, rank: 4, points: 26000 },
      ],
    },
  ],
};

function renderPage() {
  return render(<PlayerDetailPage />);
}

/** 成績のカード(項目名 → 値) */
function statCards(): Record<string, string> {
  const cards = Array.from(document.querySelectorAll(".stat"));
  return Object.fromEntries(
    cards.map((c) => [c.querySelector(".k")?.textContent ?? "", c.querySelector(".v")?.textContent ?? ""]),
  );
}

/** 対局履歴の表の行(セルの文字) */
function historyRows() {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
}

function target(link: HTMLElement) {
  const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
  return { pathname: url.pathname.replace(/\/$/, ""), id: url.searchParams.get("id") };
}

beforeEach(() => {
  mocks.query = "id=1";
  getPlayerDetail.mockResolvedValue(DETAIL);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("成績", () => {
  it("URL の id のプレイヤーを取得し、「○○さんの成績」と表示する", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: /田中さんの成績/ })).toBeTruthy();
    expect(getPlayerDetail).toHaveBeenCalledWith(1);
  });

  it("対局数・通算スコア・最高素点・平均順位・トップ率・ラス率を、カードで表示する", async () => {
    renderPage();
    await screen.findByText(/田中さんの成績/);

    expect(statCards()).toEqual({
      対局数: "5",
      通算スコア: "+52.5",
      最高素点: "42,500",
      平均順位: "2.10",
      トップ率: "30.0%",
      ラス率: "6.7%",
    });
  });

  it("通算スコアは、プラスが青", async () => {
    renderPage();
    await screen.findByText(/田中さんの成績/);

    expect(screen.getAllByText("+52.5")[0].className).toContain("plus");
  });

  it("順位の回数は、小数が出るときだけ小数第2位まで表示する", async () => {
    renderPage();
    await screen.findByText(/田中さんの成績/);

    const card = screen.getByText(/順位の回数:/);

    expect(card.textContent).toContain("1位 1.5回");
    expect(card.textContent).toContain("2位 1.83回");
    expect(card.textContent).toContain("3位 1.33回");
    expect(card.textContent).toContain("4位 0.33回");
  });

  it("整数の回数は、小数点なしで表示する", async () => {
    getPlayerDetail.mockResolvedValue({
      ...DETAIL,
      stats: { ...DETAIL.stats, rank_counts: [4, 2, 0, 1] },
    });

    renderPage();

    expect((await screen.findByText(/順位の回数:/)).textContent).toContain("1位 4回");
  });
});

describe("対局履歴", () => {
  it("対局日・順位・素点・スコアを、対局日の新しい順(API の順)に表示する", async () => {
    renderPage();
    await screen.findByText(/田中さんの成績/);

    const rows = historyRows().map((cells) => cells.slice(0, 4));

    expect(rows).toEqual([
      ["2026-11-22", "2", "29,000", "+9.0"],
      ["2026-11-20", "1.5", "36,000", "+26.0"],
      ["2026-11-10", "3", "30,000", "−10.0"],
    ]);
  });

  it("同卓者の、名前・順位・点数(素点)を表示する", async () => {
    renderPage();
    await screen.findByText(/田中さんの成績/);

    const mates = historyRows()[0][4];

    expect(mates).toContain("佐藤 1位 38,000点");
    expect(mates).toContain("高橋 3位 27,000点");
    expect(mates).toContain("鈴木 4位 25,000点");
  });

  it("同卓者の順位が同点なら、1.5位のように小数で表示する", async () => {
    renderPage();
    await screen.findByText(/田中さんの成績/);

    expect(historyRows()[1][4]).toContain("1.5位 36,000点");
  });

  it("同卓者の名前は、そのプレイヤーの詳細へのリンク", async () => {
    renderPage();
    await screen.findByText(/田中さんの成績/);

    const row = screen.getAllByRole("row")[1];
    const link = within(row).getByRole("link", { name: "佐藤" });

    expect(target(link)).toEqual({ pathname: "/players/detail", id: "2" });
  });

  it("削除済みの同卓者は、「削除されたプレイヤー」と表示し、リンクにしない", async () => {
    renderPage();
    await screen.findByText(/田中さんの成績/);

    const row = screen.getAllByRole("row")[2];

    expect(within(row).getByText("削除されたプレイヤー")).toBeTruthy();
    expect(within(row).queryByText("山田")).toBeNull();
    expect(within(row).queryByRole("link", { name: "削除されたプレイヤー" })).toBeNull();
  });
});

describe("特別な場合", () => {
  it("削除済みのプレイヤーの詳細も表示でき、「削除済み」のバッジが付く", async () => {
    getPlayerDetail.mockResolvedValue({ ...DETAIL, player: { id: 5, name: "山田", deleted: true } });
    mocks.query = "id=5";

    renderPage();

    expect(await screen.findByText("削除済み")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /山田さんの成績/ })).toBeTruthy();
  });

  it("削除されていないプレイヤーには、バッジが付かない", async () => {
    renderPage();
    await screen.findByText(/田中さんの成績/);

    expect(screen.queryByText("削除済み")).toBeNull();
  });

  it("対局が0件のときは、成績は「-」、履歴は「対局がありません。」", async () => {
    getPlayerDetail.mockResolvedValue({
      player: { id: 6, name: "新人", deleted: false },
      stats: {
        games_count: 0,
        total_score: null,
        max_points: null,
        avg_rank: null,
        rank_counts: [0, 0, 0, 0],
        top_rate: null,
        last_rate: null,
      },
      history: [],
    });
    mocks.query = "id=6";

    renderPage();

    expect(await screen.findByText("対局がありません。")).toBeTruthy();
    expect(statCards()).toEqual({
      対局数: "0",
      通算スコア: "-",
      最高素点: "-",
      平均順位: "-",
      トップ率: "-",
      ラス率: "-",
    });
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("表示の状態", () => {
  it("読み込み中は、その旨を表示する", () => {
    getPlayerDetail.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText("読み込み中...")).toBeTruthy();
  });

  it("存在しないプレイヤー(404)は、その旨と、成績一覧への戻り方を表示する", async () => {
    getPlayerDetail.mockRejectedValue(new ApiError(404, "プレイヤーが見つかりません"));
    mocks.query = "id=999";

    renderPage();

    expect(await screen.findByText("プレイヤーが見つかりません")).toBeTruthy();
    expect(screen.getByRole("link", { name: "成績一覧へ戻る" })).toBeTruthy();
  });

  it("URL に id がない・数字でないときは、API を呼ばずに、見つからない旨を表示する", async () => {
    for (const query of ["", "id=abc", "id=0", "id=-3"]) {
      mocks.query = query;
      renderPage();

      expect(await screen.findByText("プレイヤーが見つかりません")).toBeTruthy();
      cleanup();
    }
    expect(getPlayerDetail).not.toHaveBeenCalled();
  });

  it("通信に失敗したときは、エラーを表示し、再読み込みで取得し直せる", async () => {
    getPlayerDetail.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_MESSAGE));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "再読み込み" }));

    expect(await screen.findByText(/田中さんの成績/)).toBeTruthy();
    expect(getPlayerDetail).toHaveBeenCalledTimes(2);
  });
});
