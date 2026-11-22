// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ToastProvider";
import * as api from "@/lib/api";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api";
import { todayString } from "@/lib/gameForm";
import { PLAYERS, VALID_GAME_PAYLOAD, fillValidGame } from "@/test/gameFormHelpers";

import NewGamePage from "./page";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, listPlayers: vi.fn(), createGame: vi.fn() };
});

const listPlayers = vi.mocked(api.listPlayers);
const createGame = vi.mocked(api.createGame);

function renderPage() {
  return render(
    <ToastProvider>
      <NewGamePage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  listPlayers.mockResolvedValue(PLAYERS);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("表示", () => {
  it("プレイヤーを読み込むと、入力フォームが出る。対局日の初期値は今日", async () => {
    renderPage();

    const date = (await screen.findByLabelText("対局日")) as HTMLInputElement;
    expect(date.value).toBe(todayString());
    expect(screen.getByRole("heading", { name: "対局を登録する" })).toBeTruthy();
  });

  it("読み込み中は、その旨を表示する", () => {
    listPlayers.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText("読み込み中...")).toBeTruthy();
    expect(screen.queryByLabelText("対局日")).toBeNull();
  });

  it("プレイヤーが4人未満のときは、フォームの代わりに案内を出す", async () => {
    listPlayers.mockResolvedValue(PLAYERS.slice(0, 3));

    renderPage();

    expect(await screen.findByText(/プレイヤーが4人以上必要です\(今: 3人\)/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "プレイヤー管理で登録する" })).toBeTruthy();
    expect(screen.queryByLabelText("対局日")).toBeNull();
  });

  it("プレイヤーの取得に失敗したときは、エラーを表示し、再読み込みできる", async () => {
    listPlayers.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_MESSAGE));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "再読み込み" }));

    expect(await screen.findByLabelText("対局日")).toBeTruthy();
  });
});

describe("登録", () => {
  it("登録すると、API を呼び、成功メッセージを出して、対局一覧に移動する", async () => {
    createGame.mockResolvedValue({ id: 1, played_on: todayString(), kyotaku: 0, results: [] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("対局日");

    await fillValidGame(user);
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(createGame).toHaveBeenCalledWith(VALID_GAME_PAYLOAD(todayString()));
    expect(await screen.findByText("対局を登録しました")).toBeTruthy();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/games/"));
  });

  it("API が誤りを返したら、移動せずにメッセージを表示する", async () => {
    createGame.mockRejectedValue(
      new ApiError(422, "入力内容に誤りがあります", [
        { field: "results", message: "削除されたプレイヤーは選べません" },
      ]),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("対局日");

    await fillValidGame(user);
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByText("削除されたプレイヤーは選べません")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.queryByText("対局を登録しました")).toBeNull();
  });

  it("「キャンセル」を押すと、登録せずに対局一覧に戻る", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("対局日");

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(createGame).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/games/");
  });
});
