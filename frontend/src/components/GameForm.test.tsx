// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { emptyForm } from "@/lib/gameForm";
import {
  PLAYERS,
  VALID_GAME_PAYLOAD,
  fillValidGame,
  selectPlayer,
  typePoints,
} from "@/test/gameFormHelpers";

import GameForm, { type PlayerOption } from "./GameForm";

function renderForm(overrides: { players?: PlayerOption[]; onSubmit?: () => Promise<void> } = {}) {
  const onSubmit = vi.fn(overrides.onSubmit ?? (async () => {}));
  const onCancel = vi.fn();
  render(
    <GameForm
      initial={emptyForm("2026-11-22")}
      players={overrides.players ?? PLAYERS}
      submitLabel="登録する"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onCancel };
}

const submitButton = () => screen.getByRole("button", { name: "登録する" }) as HTMLButtonElement;
const sumbox = () => screen.getByText(/^合計:/);

afterEach(() => {
  cleanup();
});

describe("最初の表示", () => {
  it("対局日は渡された日付、供託は0、4人分の空欄がある", () => {
    renderForm();

    expect((screen.getByLabelText("対局日") as HTMLInputElement).value).toBe("2026-11-22");
    expect((screen.getByLabelText("供託") as HTMLInputElement).value).toBe("0");
    for (const n of [1, 2, 3, 4]) {
      expect((screen.getByLabelText(`${n}人目のプレイヤー`) as HTMLSelectElement).value).toBe("");
      expect((screen.getByLabelText(`${n}人目の素点`) as HTMLInputElement).value).toBe("");
    }
  });

  it("入力するまでは、「登録する」を押せず、誤りの文章も出さない", () => {
    renderForm();

    expect(submitButton().disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("合計は「あと 120,000 点」と表示する", () => {
    renderForm();

    expect(sumbox().textContent).toContain("素点 0 + 供託 0 = 0 点");
    expect(sumbox().textContent).toContain("(あと 120,000 点)");
  });
});

describe("プレイヤーの選択", () => {
  it("選べるのは、渡されたプレイヤーだけ", () => {
    renderForm();

    const options = within(screen.getByLabelText("1人目のプレイヤー")).getAllByRole("option");

    expect(options.map((o) => o.textContent)).toEqual([
      "プレイヤーを選択",
      "田中",
      "佐藤",
      "鈴木",
      "高橋",
      "山田",
    ]);
  });

  it("他の欄で選んだプレイヤーは、選べなくなる", async () => {
    const user = userEvent.setup();
    renderForm();

    await selectPlayer(user, 1, 1); // 1人目に田中

    const option = (n: number, name: string) =>
      within(screen.getByLabelText(`${n}人目のプレイヤー`)).getByRole("option", {
        name,
      }) as HTMLOptionElement;
    expect(option(2, "田中").disabled).toBe(true);
    expect(option(3, "田中").disabled).toBe(true);
    expect(option(1, "田中").disabled).toBe(false); // 自分の欄では選べる
    expect(option(2, "佐藤").disabled).toBe(false);
  });

  it("選び直すと、元のプレイヤーは他の欄で選べるようになる", async () => {
    const user = userEvent.setup();
    renderForm();
    await selectPlayer(user, 1, 1);

    await selectPlayer(user, 1, 2); // 田中から佐藤に変える

    const second = screen.getByLabelText("2人目のプレイヤー");
    expect((within(second).getByRole("option", { name: "田中" }) as HTMLOptionElement).disabled).toBe(false);
    expect((within(second).getByRole("option", { name: "佐藤" }) as HTMLOptionElement).disabled).toBe(true);
  });

  it("削除済みのプレイヤーは「(削除済み)」と表示される", () => {
    renderForm({ players: [...PLAYERS.slice(0, 4), { id: 9, name: "元メンバー", deleted: true }] });

    const names = within(screen.getByLabelText("1人目のプレイヤー"))
      .getAllByRole("option")
      .map((o) => o.textContent);

    expect(names).toContain("元メンバー(削除済み)");
  });
});

describe("合計の表示と入力チェック", () => {
  it("素点を入れるたびに、合計と、あと何点かを表示する", async () => {
    const user = userEvent.setup();
    renderForm();

    await typePoints(user, 1, "42500");

    expect(sumbox().textContent).toContain("素点 42,500 + 供託 0 = 42,500 点");
    expect(sumbox().textContent).toContain("(あと 77,500 点)");
  });

  it("供託も合計に入る", async () => {
    const user = userEvent.setup();
    renderForm();

    const kyotaku = screen.getByLabelText("供託");
    await user.clear(kyotaku);
    await user.type(kyotaku, "1000");

    expect(sumbox().textContent).toContain("供託 1,000");
    expect(sumbox().textContent).toContain("(あと 119,000 点)");
  });

  it("ちょうど 120,000 点になると「OK」になり、「登録する」を押せる", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillValidGame(user);

    expect(sumbox().textContent).toContain("= 120,000 点 (OK)");
    expect(sumbox().className).toContain("ok");
    expect(submitButton().disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("120,000 点に足りないと、誤りを表示し、押せない", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValidGame(user);

    await user.clear(screen.getByLabelText("1人目の素点"));
    await user.type(screen.getByLabelText("1人目の素点"), "41500");

    expect(screen.getByRole("alert").textContent).toContain(
      "素点の合計と供託の合計が 120,000点になっていません(現在: 119,000点)",
    );
    expect(sumbox().textContent).toContain("(あと 1,000 点)");
    expect(submitButton().disabled).toBe(true);
  });

  it("120,000 点を超えると、「多い」と表示する", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValidGame(user);

    await user.clear(screen.getByLabelText("1人目の素点"));
    await user.type(screen.getByLabelText("1人目の素点"), "43500");

    expect(sumbox().textContent).toContain("(1,000 点 多い)");
    expect(sumbox().className).not.toContain("ok");
  });

  it("供託が残った対局は、素点の合計 + 供託 が 120,000 点なら登録できる", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValidGame(user);

    await user.clear(screen.getByLabelText("1人目の素点"));
    await user.type(screen.getByLabelText("1人目の素点"), "41500");
    const kyotaku = screen.getByLabelText("供託");
    await user.clear(kyotaku);
    await user.type(kyotaku, "1000");

    expect(sumbox().textContent).toContain("(OK)");
    expect(submitButton().disabled).toBe(false);
  });

  it("入力を始めると、足りない項目の誤りを表示する", async () => {
    const user = userEvent.setup();
    renderForm();

    await typePoints(user, 1, "42500");

    const alert = screen.getByRole("alert").textContent;
    expect(alert).toContain("4人のプレイヤーを選択してください");
    expect(alert).toContain("4人分の素点を入力してください");
  });

  it("100点単位でない素点は、誤りになる", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValidGame(user);

    await user.clear(screen.getByLabelText("2人目の素点"));
    await user.type(screen.getByLabelText("2人目の素点"), "31050");

    expect(screen.getByRole("alert").textContent).toContain("素点は100点単位で入力してください");
    expect(submitButton().disabled).toBe(true);
  });

  it("素点がマイナス(トビ)でも入力できる", async () => {
    const user = userEvent.setup();
    renderForm();
    const entries: [number, string][] = [[1, "50000"], [2, "40000"], [3, "33000"], [4, "-3000"]];
    for (const [n, points] of entries) {
      await selectPlayer(user, n, n);
      await typePoints(user, n, points);
    }

    expect(sumbox().textContent).toContain("(OK)");
    expect(submitButton().disabled).toBe(false);
  });
});

describe("登録", () => {
  it("「登録する」を押すと、入力した内容を API 用の形で渡す", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await fillValidGame(user);

    await user.click(submitButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(VALID_GAME_PAYLOAD("2026-11-22"));
  });

  it("対局日を変えると、変えた日付で渡す", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await fillValidGame(user);

    const date = screen.getByLabelText("対局日");
    await user.clear(date);
    await user.type(date, "2026-12-01");
    await user.click(submitButton());

    expect(onSubmit).toHaveBeenCalledWith(VALID_GAME_PAYLOAD("2026-12-01"));
  });

  it("保存に失敗したら、API のメッセージを表示し、入力は残し、もう一度押せる", async () => {
    const user = userEvent.setup();
    const error = new ApiError(422, "入力内容に誤りがあります", [
      { field: "results", message: "削除されたプレイヤーは選べません" },
    ]);
    const { onSubmit } = renderForm({ onSubmit: async () => Promise.reject(error) });
    await fillValidGame(user);

    await user.click(submitButton());

    expect((await screen.findByRole("alert")).textContent).toContain("削除されたプレイヤーは選べません");
    expect((screen.getByLabelText("1人目の素点") as HTMLInputElement).value).toBe("42500");
    expect(submitButton().disabled).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("保存している間は、二重に押せない", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const { onSubmit } = renderForm({ onSubmit: () => new Promise<void>((r) => (finish = r)) });
    await fillValidGame(user);

    await user.click(submitButton());

    expect(submitButton().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "キャンセル" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finish();
  });

  it("誤りがあるときは、Enter キーでも送信されない", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText("1人目の素点"), "42500{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("キャンセル", () => {
  it("「キャンセル」を押すと、onCancel が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onCancel, onSubmit } = renderForm();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
