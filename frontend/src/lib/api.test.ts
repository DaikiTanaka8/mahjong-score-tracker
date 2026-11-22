import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, NETWORK_ERROR_MESSAGE, createGame, deletePlayer, listPlayers } from "./api";

/** fetch(ブラウザの通信)を、指定した応答を返す偽物に差し替える */
function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("成功したとき", () => {
  it("JSON を返す", async () => {
    mockFetch(json([{ id: 1, name: "田中" }]));

    expect(await listPlayers()).toEqual([{ id: 1, name: "田中" }]);
  });

  it("/api を基準のURLにして呼ぶ", async () => {
    const fetchMock = mockFetch(json([]));

    await listPlayers();

    expect(fetchMock).toHaveBeenCalledWith("/api/players", expect.anything());
  });

  it("削除(204)は、何も返さない", async () => {
    mockFetch(new Response(null, { status: 204 }));

    expect(await deletePlayer(1)).toBeUndefined();
  });

  it("登録のとき、メソッドと JSON の本文を送る", async () => {
    const fetchMock = mockFetch(json({ id: 1 }, 201));
    const input = {
      played_on: "2026-11-22",
      kyotaku: 0,
      results: [{ player_id: 1, points: 30000 }],
    };

    await createGame(input);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });
});

describe("API がエラーを返したとき", () => {
  it("項目ごとのメッセージを持った ApiError になる", async () => {
    mockFetch(
      json(
        {
          message: "入力内容に誤りがあります",
          errors: [
            { field: "played_on", message: "対局日を入力してください" },
            { field: "results", message: "4人のプレイヤーを選択してください" },
          ],
        },
        422,
      ),
    );

    const error = await createGame({ played_on: "", kyotaku: 0, results: [] }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.message).toBe("入力内容に誤りがあります");
    expect(error.errors).toHaveLength(2);
    // 画面に出すのは、項目ごとのメッセージ
    expect(error.messages).toEqual(["対局日を入力してください", "4人のプレイヤーを選択してください"]);
  });

  it("項目ごとのメッセージがなければ、全体のメッセージを使う", async () => {
    mockFetch(json({ message: "プレイヤーが見つかりません", errors: [] }, 404));

    const error = await deletePlayer(999).catch((e) => e);

    expect(error.status).toBe(404);
    expect(error.messages).toEqual(["プレイヤーが見つかりません"]);
  });

  it("エラーの本文がJSONでないときは、通信失敗のメッセージにする", async () => {
    mockFetch(new Response("<html>Bad Gateway</html>", { status: 502 }));

    const error = await listPlayers().catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.messages).toEqual([NETWORK_ERROR_MESSAGE]);
  });
});

describe("通信できなかったとき", () => {
  it("status 0 の ApiError になる", async () => {
    mockFetch(new TypeError("Failed to fetch"));

    const error = await listPlayers().catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.messages).toEqual([NETWORK_ERROR_MESSAGE]);
  });
});
