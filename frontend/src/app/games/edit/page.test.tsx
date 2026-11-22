// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ToastProvider";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { Game } from "@/lib/types";
import { PLAYERS, typePoints } from "@/test/gameFormHelpers";

import EditGamePage from "./page";

const mocks = vi.hoisted(() => ({ push: vi.fn(), query: "id=5" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, listPlayers: vi.fn(), getGame: vi.fn(), updateGame: vi.fn() };
});

const listPlayers = vi.mocked(api.listPlayers);
const getGame = vi.mocked(api.getGame);
const updateGame = vi.mocked(api.updateGame);

/** 登録済みの対局。供託 1,000点。4位の「山田」(ID 5)は、すでに削除されている */
const GAME: Game = {
  id: 5,
  played_on: "2026-11-22",
  kyotaku: 1000,
  results: [
    { player_id: 2, player_name: "佐藤", player_deleted: false, points: 38000, rank_from: 1, rank_to: 1, rank: 1, final_score: 38 },
    { player_id: 1, player_name: "田中", player_deleted: false, points: 29000, rank_from: 2, rank_to: 2, rank: 2, final_score: 9 },
    { player_id: 4, player_name: "高橋", player_deleted: false, points: 27000, rank_from: 3, rank_to: 3, rank: 3, final_score: -13 },
    { player_id: 5, player_name: "山田", player_deleted: true, points: 25000, rank_from: 4, rank_to: 4, rank: 4, final_score: -35 },
  ],
};

function renderPage() {
  return render(
    <ToastProvider>
      <EditGamePage />
    </ToastProvider>,
  );
}

const selectValue = (n: number) =>
  (screen.getByLabelText(`${n}人目のプレイヤー`) as HTMLSelectElement).value;
const pointsValue = (n: number) => (screen.getByLabelText(`${n}人目の素点`) as HTMLInputElement).value;

beforeEach(() => {
  mocks.query = "id=5";
  // 削除されていないプレイヤー(山田は削除済みなので、一覧にいない)
  listPlayers.mockResolvedValue(PLAYERS.slice(0, 4));
  getGame.mockResolvedValue(GAME);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("表示", () => {
  it("URL の id の対局を取得し、登録済みの内容が入った状態で表示する", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "対局を編集する" })).toBeTruthy();
    expect(await screen.findByLabelText("対局日")).toBeTruthy();
    expect(getGame).toHaveBeenCalledWith(5);
    expect((screen.getByLabelText("対局日") as HTMLInputElement).value).toBe("2026-11-22");
    expect((screen.getByLabelText("供託") as HTMLInputElement).value).toBe("1000");
    expect([1, 2, 3, 4].map(selectValue)).toEqual(["2", "1", "4", "5"]);
    expect([1, 2, 3, 4].map(pointsValue)).toEqual(["38000", "29000", "27000", "25000"]);
  });

  it("登録済みの内容は、そのまま「OK」で、「更新する」を押せる", async () => {
    renderPage();

    const button = (await screen.findByRole("button", { name: "更新する" })) as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    expect(screen.getByText(/^合計:/).textContent).toContain("(OK)");
  });

  it("もともと参加している削除済みのプレイヤーは、選択肢に残る", async () => {
    renderPage();
    await screen.findByLabelText("対局日");

    const names = within(screen.getByLabelText("1人目のプレイヤー"))
      .getAllByRole("option")
      .map((o) => o.textContent);

    expect(names).toContain("山田(削除済み)");
  });

  it("読み込み中は、その旨を表示する", () => {
    getGame.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText("読み込み中...")).toBeTruthy();
  });
});

describe("対局が見つからないとき", () => {
  it("API が 404 を返したら、その旨と、対局一覧への戻り方を表示する", async () => {
    getGame.mockRejectedValue(new ApiError(404, "対局が見つかりません"));

    renderPage();

    expect(await screen.findByText("対局が見つかりません")).toBeTruthy();
    expect(screen.getByRole("link", { name: "対局一覧へ戻る" })).toBeTruthy();
    expect(screen.queryByLabelText("対局日")).toBeNull();
  });

  it("URL に id がないときは、API を呼ばずに、見つからない旨を表示する", async () => {
    mocks.query = "";

    renderPage();

    expect(await screen.findByText("対局が見つかりません")).toBeTruthy();
    expect(getGame).not.toHaveBeenCalled();
  });

  it("id が数字でないときも、見つからない旨を表示する", async () => {
    mocks.query = "id=abc";

    renderPage();

    expect(await screen.findByText("対局が見つかりません")).toBeTruthy();
    expect(getGame).not.toHaveBeenCalled();
  });
});

describe("更新", () => {
  it("素点を直して更新すると、API を呼び、成功メッセージを出して、対局一覧に移動する", async () => {
    updateGame.mockResolvedValue(GAME);
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("対局日");

    // 田中と佐藤の素点を入れ替えて、合計はそのまま
    await user.clear(screen.getByLabelText("1人目の素点"));
    await typePoints(user, 1, "29000");
    await user.clear(screen.getByLabelText("2人目の素点"));
    await typePoints(user, 2, "38000");
    await user.click(screen.getByRole("button", { name: "更新する" }));

    expect(updateGame).toHaveBeenCalledWith(5, {
      played_on: "2026-11-22",
      kyotaku: 1000,
      results: [
        { player_id: 2, points: 29000 },
        { player_id: 1, points: 38000 },
        { player_id: 4, points: 27000 },
        { player_id: 5, points: 25000 },
      ],
    });
    expect(await screen.findByText("対局を更新しました")).toBeTruthy();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/games/"));
  });

  it("合計が合わなくなったら、更新できない", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("対局日");

    await user.clear(screen.getByLabelText("1人目の素点"));
    await typePoints(user, 1, "39000");

    expect((screen.getByRole("button", { name: "更新する" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("(現在: 121,000点)");
  });

  it("API が誤りを返したら、移動せずにメッセージを表示する", async () => {
    updateGame.mockRejectedValue(new ApiError(404, "対局が見つかりません"));
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("対局日");

    await user.click(screen.getByRole("button", { name: "更新する" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("対局が見つかりません");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("「キャンセル」を押すと、更新せずに対局一覧に戻る", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("対局日");

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(updateGame).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/games/");
  });
});
