// 対局フォームの、テスト用の操作(テストファイルから共通で使う)
import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** テストで使うプレイヤー。IDは 1〜5 */
export const PLAYERS = [
  { id: 1, name: "田中" },
  { id: 2, name: "佐藤" },
  { id: 3, name: "鈴木" },
  { id: 4, name: "高橋" },
  { id: 5, name: "山田" },
];

/** n人目(1〜4)のプレイヤーを選ぶ */
export async function selectPlayer(user: UserEvent, n: number, playerId: number) {
  await user.selectOptions(screen.getByLabelText(`${n}人目のプレイヤー`), String(playerId));
}

/** n人目(1〜4)の素点を入力する */
export async function typePoints(user: UserEvent, n: number, points: string) {
  await user.type(screen.getByLabelText(`${n}人目の素点`), points);
}

/** 正しい4人分(合計 120,000点)を入力する */
export async function fillValidGame(user: UserEvent) {
  const entries: [number, string][] = [
    [1, "42500"],
    [2, "31000"],
    [3, "28000"],
    [4, "18500"],
  ];
  for (const [n, points] of entries) {
    await selectPlayer(user, n, n); // n人目に、IDがnのプレイヤーを選ぶ
    await typePoints(user, n, points);
  }
}

/** 上の fillValidGame で入力したときに、API へ送られるはずの内容 */
export const VALID_GAME_PAYLOAD = (playedOn: string) => ({
  played_on: playedOn,
  kyotaku: 0,
  results: [
    { player_id: 1, points: 42500 },
    { player_id: 2, points: 31000 },
    { player_id: 3, points: 28000 },
    { player_id: 4, points: 18500 },
  ],
});
