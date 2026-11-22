// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ToastProvider";
import * as api from "@/lib/api";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api";
import type { Game, GameResult } from "@/lib/types";

import GamesPage from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, listGames: vi.fn(), deleteGame: vi.fn() };
});

const listGames = vi.mocked(api.listGames);
const deleteGame = vi.mocked(api.deleteGame);

function result(
  id: number,
  name: string,
  points: number,
  rank: number,
  score: number,
  deleted = false,
): GameResult {
  return {
    player_id: id,
    player_name: name,
    player_deleted: deleted,
    points,
    rank_from: Math.floor(rank),
    rank_to: Math.ceil(rank),
    rank,
    final_score: score,
  };
}

/** API が返す順(対局日の新しい順)。供託が残った対局 → 同点で削除済みのプレイヤーがいる対局 → 同点なし */
const GAMES: Game[] = [
  {
    id: 3,
    played_on: "2026-11-22",
    kyotaku: 1000,
    results: [
      result(2, "佐藤", 38000, 1, 38),
      result(1, "田中", 29000, 2, 9),
      result(4, "高橋", 27000, 3, -13),
      result(3, "鈴木", 25000, 4, -35),
    ],
  },
  {
    id: 2,
    played_on: "2026-11-20",
    kyotaku: 0,
    results: [
      result(1, "田中", 36000, 1.5, 26),
      result(5, "山田", 36000, 1.5, 26, true),
      result(3, "鈴木", 28000, 3, -12),
      result(4, "高橋", 20000, 4, -40),
    ],
  },
  {
    id: 1,
    played_on: "2026-11-10",
    kyotaku: 0,
    results: [
      result(4, "高橋", 33000, 1, 33),
      result(2, "佐藤", 31000, 2, 11),
      result(1, "田中", 30000, 3, -10),
      result(3, "鈴木", 26000, 4, -34),
    ],
  },
];

function renderPage() {
  return render(
    <ToastProvider>
      <GamesPage />
    </ToastProvider>,
  );
}

/** n番目(0始まり)の対局カード */
function card(n: number) {
  return within(document.querySelectorAll<HTMLElement>(".game")[n]);
}

/** リンクの行き先(パスと、クエリの id)。末尾のスラッシュの有無は区別しない */
function target(link: HTMLElement) {
  const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
  return { pathname: url.pathname.replace(/\/$/, ""), id: url.searchParams.get("id") };
}

beforeEach(() => {
  listGames.mockResolvedValue(GAMES);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("一覧の表示", () => {
  it("対局を、API が返した順(対局日の新しい順)に、カードで表示する", async () => {
    renderPage();

    await screen.findByText("2026-11-22");

    const dates = Array.from(document.querySelectorAll(".game .date")).map((e) => e.textContent);
    expect(dates).toEqual(["2026-11-22", "2026-11-20", "2026-11-10"]);
  });

  it("1件ごとに、4人分の名前・順位・素点・スコアを、順位順の表で表示する", async () => {
    renderPage();
    await screen.findByText("2026-11-22");

    const rows = card(0).getAllByRole("row").slice(1); // 見出しの行を除く
    const cells = rows.map((row) => within(row).getAllByRole("cell").map((c) => c.textContent));

    expect(cells).toEqual([
      ["佐藤", "1", "38,000", "+38.0"],
      ["田中", "2", "29,000", "+9.0"],
      ["高橋", "3", "27,000", "−13.0"],
      ["鈴木", "4", "25,000", "−35.0"],
    ]);
  });

  it("スコアは、プラスが青、マイナスが赤", async () => {
    renderPage();
    await screen.findByText("2026-11-22");

    expect(card(0).getByText("+38.0").className).toContain("plus");
    expect(card(0).getByText("−13.0").className).toContain("minus");
  });

  it("同点の順位は、1.5 のように小数のまま表示する", async () => {
    renderPage();
    await screen.findByText("2026-11-22");

    const ranks = card(1)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent);

    expect(ranks).toEqual(["1.5", "1.5", "3", "4"]);
  });

  it("名前を押すと、そのプレイヤーの詳細に移動できる", async () => {
    renderPage();
    await screen.findByText("2026-11-22");

    const link = card(0).getByRole("link", { name: "佐藤" });

    expect(target(link)).toEqual({ pathname: "/players/detail", id: "2" });
  });

  it("削除済みのプレイヤーは「削除されたプレイヤー」と表示し、リンクにしない", async () => {
    renderPage();
    await screen.findByText("2026-11-22");

    expect(card(1).getByText("削除されたプレイヤー")).toBeTruthy();
    expect(card(1).queryByRole("link", { name: "山田" })).toBeNull();
    expect(card(1).queryByText("山田")).toBeNull(); // 名前は出さない
    expect(card(1).queryByRole("link", { name: "削除されたプレイヤー" })).toBeNull();
  });
});

describe("供託", () => {
  it("供託が0でない対局だけ、「※供託 1,000点」と表示する", async () => {
    renderPage();
    await screen.findByText("2026-11-22");

    expect(card(0).getByText("※供託 1,000点")).toBeTruthy();
    expect(card(1).queryByText(/供託/)).toBeNull();
    expect(card(2).queryByText(/供託/)).toBeNull();
  });

  it("「編集」ボタンの左側(同じ見出しの行の中)に表示する", async () => {
    renderPage();
    await screen.findByText("2026-11-22");

    const head = document.querySelector(".game-head") as HTMLElement;
    const kyotaku = within(head).getByText("※供託 1,000点");
    const edit = within(head).getByRole("link", { name: "編集" });

    // DOM 上で、供託のほうが先(左)にある
    expect(kyotaku.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("ボタン", () => {
  it("「＋ 対局を登録する」は、登録画面へのリンク", async () => {
    renderPage();

    const link = await screen.findByRole("link", { name: "＋ 対局を登録する" });

    expect(target(link).pathname).toBe("/games/new");
  });

  it("「編集」は、その対局の編集画面へのリンク", async () => {
    renderPage();
    await screen.findByText("2026-11-22");

    const link = card(1).getByRole("link", { name: "編集" });

    expect(target(link)).toEqual({ pathname: "/games/edit", id: "2" });
  });
});

describe("表示の状態", () => {
  it("読み込み中は、その旨を表示する", () => {
    listGames.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText("読み込み中...")).toBeTruthy();
  });

  it("対局がないときは、その旨を表示する(登録ボタンは出ている)", async () => {
    listGames.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("対局が登録されていません。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "＋ 対局を登録する" })).toBeTruthy();
  });

  it("取得に失敗したときは、エラーを表示し、再読み込みで取得し直せる", async () => {
    listGames.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_MESSAGE));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "再読み込み" }));

    expect(await screen.findByText("2026-11-22")).toBeTruthy();
    expect(listGames).toHaveBeenCalledTimes(2);
  });
});

describe("削除", () => {
  async function clickDelete(user: ReturnType<typeof userEvent.setup>, n: number) {
    await screen.findByText("2026-11-22");
    await user.click(card(n).getByRole("button", { name: "削除" }));
  }

  it("「削除」を押すと、その対局の日付を入れた確認ダイアログが出る。まだ削除はしない", async () => {
    const user = userEvent.setup();
    renderPage();

    await clickDelete(user, 1);

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("この対局(2026-11-20)を削除しますか?");
    expect(dialog.textContent).toContain("元に戻せません");
    expect(deleteGame).not.toHaveBeenCalled();
  });

  it("「削除する」を押すと、その対局を削除し、成功メッセージを出して、一覧を取得し直す", async () => {
    deleteGame.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await clickDelete(user, 1);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "削除する" }));

    expect(deleteGame).toHaveBeenCalledWith(2); // 2番目のカードの対局(ID 2)
    expect(await screen.findByText("対局を削除しました")).toBeTruthy();
    await waitFor(() => expect(listGames).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("「キャンセル」を押すと、何もせずに閉じる", async () => {
    const user = userEvent.setup();
    renderPage();

    await clickDelete(user, 0);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteGame).not.toHaveBeenCalled();
  });

  it("削除に失敗したときは、エラーを表示し、一覧を最新にする", async () => {
    deleteGame.mockRejectedValue(new ApiError(404, "対局が見つかりません"));
    const user = userEvent.setup();
    renderPage();

    await clickDelete(user, 0);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "削除する" }));

    expect(await screen.findByText("対局が見つかりません")).toBeTruthy();
    await waitFor(() => expect(listGames).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("対局を削除しました")).toBeNull();
  });
});
