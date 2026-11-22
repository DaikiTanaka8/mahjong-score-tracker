// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ToastProvider";
import { ApiError, NETWORK_ERROR_MESSAGE } from "@/lib/api";
import * as api from "@/lib/api";

import PlayersPage from "./page";

// API は偽物に差し替える(ApiError や errorMessages は本物を使う)
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listPlayers: vi.fn(),
    createPlayer: vi.fn(),
    renamePlayer: vi.fn(),
    deletePlayer: vi.fn(),
  };
});

const listPlayers = vi.mocked(api.listPlayers);
const createPlayer = vi.mocked(api.createPlayer);
const renamePlayer = vi.mocked(api.renamePlayer);
const deletePlayer = vi.mocked(api.deletePlayer);

const PLAYERS = [
  { id: 1, name: "田中" },
  { id: 2, name: "佐藤" },
];

function renderPage() {
  return render(
    <ToastProvider>
      <PlayersPage />
    </ToastProvider>,
  );
}

/** リンクの行き先(パスと id)。末尾のスラッシュの有無(Next.js の設定で変わる)は区別しない */
function detailTarget(link: HTMLElement) {
  const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
  return { pathname: url.pathname.replace(/\/$/, ""), id: url.searchParams.get("id") };
}

const validationError = (message: string, status = 422) =>
  new ApiError(status, message, [{ field: "name", message }]);

beforeEach(() => {
  listPlayers.mockResolvedValue(PLAYERS);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("一覧の表示", () => {
  it("プレイヤーの名前を一覧で表示し、名前はプレイヤー詳細へのリンクになる", async () => {
    renderPage();

    const tanaka = await screen.findByRole("link", { name: "田中" });
    const sato = screen.getByRole("link", { name: "佐藤" });

    expect(detailTarget(tanaka)).toEqual({ pathname: "/players/detail", id: "1" });
    expect(detailTarget(sato)).toEqual({ pathname: "/players/detail", id: "2" });
  });

  it("読み込み中は、その旨を表示する", () => {
    listPlayers.mockReturnValue(new Promise(() => {})); // 返ってこない

    renderPage();

    expect(screen.getByText("読み込み中...")).toBeTruthy();
  });

  it("プレイヤーがいないときは、その旨を表示する", async () => {
    listPlayers.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("プレイヤーが登録されていません。")).toBeTruthy();
  });

  it("取得に失敗したときは、エラーを表示し、再読み込みで取得し直せる", async () => {
    listPlayers.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_MESSAGE));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "再読み込み" }));

    expect(await screen.findByRole("link", { name: "田中" })).toBeTruthy();
    expect(listPlayers).toHaveBeenCalledTimes(2);
  });
});

describe("新規登録", () => {
  it("名前を入力して登録すると、API を呼び、成功メッセージを出して、一覧を取得し直す", async () => {
    createPlayer.mockResolvedValue({ id: 3, name: "鈴木" });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    const input = screen.getByLabelText("新規登録");
    await user.type(input, "鈴木");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(createPlayer).toHaveBeenCalledWith("鈴木");
    expect(await screen.findByText("プレイヤーを登録しました")).toBeTruthy();
    await waitFor(() => expect(listPlayers).toHaveBeenCalledTimes(2));
    expect((input as HTMLInputElement).value).toBe(""); // 入力欄は空に戻る
  });

  it("Enter キーでも登録できる", async () => {
    createPlayer.mockResolvedValue({ id: 3, name: "鈴木" });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    await user.type(screen.getByLabelText("新規登録"), "鈴木{Enter}");

    expect(createPlayer).toHaveBeenCalledWith("鈴木");
  });

  it("API が入力エラーを返したら、そのメッセージを表示し、入力は残す", async () => {
    createPlayer.mockRejectedValue(validationError("その名前はすでに登録されています", 409));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    const input = screen.getByLabelText("新規登録");
    await user.type(input, "田中");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByText("その名前はすでに登録されています")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("田中");
    expect(screen.queryByText("プレイヤーを登録しました")).toBeNull();
  });

  it("未入力のエラーも表示する", async () => {
    createPlayer.mockRejectedValue(validationError("名前を入力してください"));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByText("名前を入力してください")).toBeTruthy();
  });

  it("通信に失敗したときは、通信エラーのメッセージを表示する", async () => {
    createPlayer.mockRejectedValue(new ApiError(0, NETWORK_ERROR_MESSAGE));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    await user.type(screen.getByLabelText("新規登録"), "鈴木");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeTruthy();
  });
});

describe("名前の編集", () => {
  async function startEditing(user: ReturnType<typeof userEvent.setup>) {
    renderPage();
    await screen.findByRole("link", { name: "田中" });
    await user.click(screen.getAllByRole("button", { name: "編集" })[0]);
    return screen.getByLabelText("名前") as HTMLInputElement;
  }

  it("「編集」を押すと、その行の名前が入力欄に変わる", async () => {
    const user = userEvent.setup();

    const input = await startEditing(user);

    expect(input.value).toBe("田中");
    expect(screen.queryByRole("link", { name: "田中" })).toBeNull();
    expect(screen.getByRole("link", { name: "佐藤" })).toBeTruthy(); // 他の行はそのまま
  });

  it("名前を変えて保存すると、API を呼び、成功メッセージを出して、一覧を取得し直す", async () => {
    renamePlayer.mockResolvedValue({ id: 1, name: "田中太郎" });
    const user = userEvent.setup();
    const input = await startEditing(user);

    await user.clear(input);
    await user.type(input, "田中太郎");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(renamePlayer).toHaveBeenCalledWith(1, "田中太郎");
    expect(await screen.findByText("名前を変更しました")).toBeTruthy();
    await waitFor(() => expect(listPlayers).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText("名前")).toBeNull(); // 編集は終わる
  });

  it("Enter キーで保存、Esc キーでキャンセルできる", async () => {
    renamePlayer.mockResolvedValue({ id: 1, name: "田中太郎" });
    const user = userEvent.setup();
    const input = await startEditing(user);

    await user.type(input, "太郎{Enter}");
    expect(renamePlayer).toHaveBeenCalledWith(1, "田中太郎");

    await waitFor(() => expect(screen.queryByLabelText("名前")).toBeNull());
    await user.click(screen.getAllByRole("button", { name: "編集" })[1]);
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("名前")).toBeNull();
    expect(renamePlayer).toHaveBeenCalledTimes(1);
  });

  it("「キャンセル」を押すと、変更せずに元に戻る", async () => {
    const user = userEvent.setup();
    const input = await startEditing(user);

    await user.type(input, "あああ");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(renamePlayer).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "田中" })).toBeTruthy();
  });

  it("API が入力エラーを返したら、その行にメッセージを表示し、編集を続けられる", async () => {
    renamePlayer.mockRejectedValue(validationError("その名前はすでに登録されています", 409));
    const user = userEvent.setup();
    const input = await startEditing(user);

    await user.clear(input);
    await user.type(input, "佐藤");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("その名前はすでに登録されています")).toBeTruthy();
    expect(screen.getByLabelText("名前")).toBeTruthy(); // 編集中のまま
  });
});

describe("削除", () => {
  it("「削除」を押すと確認ダイアログが出る。まだ削除は実行されない", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("田中さんを削除しますか?");
    expect(dialog.textContent).toContain("過去の対局は残り、「削除されたプレイヤー」と表示されます");
    expect(deletePlayer).not.toHaveBeenCalled();
  });

  it("「削除する」を押すと、API を呼び、成功メッセージを出して、一覧を取得し直す", async () => {
    deletePlayer.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "削除する" }));

    expect(deletePlayer).toHaveBeenCalledWith(1);
    expect(await screen.findByText("プレイヤーを削除しました")).toBeTruthy();
    await waitFor(() => expect(listPlayers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("「キャンセル」を押すと、何もせずに閉じる", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deletePlayer).not.toHaveBeenCalled();
  });

  it("Esc キーでも、何もせずに閉じる", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    await user.click(screen.getAllByRole("button", { name: "削除" })[1]);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deletePlayer).not.toHaveBeenCalled();
  });

  it("削除に失敗したときは、エラーを表示し、一覧を最新にする", async () => {
    deletePlayer.mockRejectedValue(new ApiError(404, "プレイヤーが見つかりません"));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "田中" });

    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "削除する" }));

    expect(await screen.findByText("プレイヤーが見つかりません")).toBeTruthy();
    await waitFor(() => expect(listPlayers).toHaveBeenCalledTimes(2));
  });
});
