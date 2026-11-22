// 対局の登録・編集フォームの、入力チェックと合計の計算(docs/画面設計.md 3.3 / docs/API設計.md 4章)。
// 画面から切り離した関数にして、単体でテストできるようにしている。
// 同じチェックをバックエンドでも行う(ここは、すぐ気づけるようにするためのもの)。

import { comma } from "./format";
import type { Game, GameInput } from "./types";

export const PLAYER_COUNT = 4;
export const TOTAL_POINTS = 120000; // 4人の素点 + 供託 の合計

export type FormRow = {
  playerId: string; // 選択したプレイヤーのID。未選択は ""
  points: string; // 入力中の素点(文字のまま持つ)
};

export type GameFormValues = {
  playedOn: string; // YYYY-MM-DD
  kyotaku: string;
  rows: FormRow[]; // 4人分
};

/** 今日の日付(YYYY-MM-DD)。日本時間の朝に前日にならないよう、パソコンの日付をそのまま使う */
export function todayString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** 新規登録の、最初のフォーム */
export function emptyForm(today: string = todayString()): GameFormValues {
  return {
    playedOn: today,
    kyotaku: "0",
    rows: Array.from({ length: PLAYER_COUNT }, () => ({ playerId: "", points: "" })),
  };
}

/** 編集の、最初のフォーム(登録済みの対局の内容) */
export function formFromGame(game: Game): GameFormValues {
  return {
    playedOn: game.played_on,
    kyotaku: String(game.kyotaku),
    rows: game.results.map((r) => ({ playerId: String(r.player_id), points: String(r.points) })),
  };
}

/** 整数の文字(マイナスも可)を数値にする。空や、整数でない文字は null */
export function parsePoints(text: string): number | null {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

const isMultipleOf100 = (n: number) => n % 100 === 0;

/** 入力中の合計。「素点の合計 + 供託」と、120,000点との差(あと何点か。超えていればマイナス) */
export function calcTotal(values: GameFormValues) {
  const pointsSum = values.rows.reduce((sum, row) => sum + (parsePoints(row.points) ?? 0), 0);
  const kyotaku = parsePoints(values.kyotaku) ?? 0;
  const total = pointsSum + kyotaku;
  return { pointsSum, kyotaku, total, diff: TOTAL_POINTS - total };
}

/** 入力チェック。誤りの文章の一覧を返す(誤りがなければ空)。順番と文言は API と同じ */
export function validate(values: GameFormValues): string[] {
  const errors: string[] = [];

  if (!values.playedOn) {
    errors.push("対局日を入力してください");
  }

  const selected = values.rows.map((r) => r.playerId).filter((id) => id !== "");
  if (selected.length < PLAYER_COUNT) {
    errors.push("4人のプレイヤーを選択してください");
  } else if (new Set(selected).size < PLAYER_COUNT) {
    errors.push("同じプレイヤーを重複して選べません");
  }

  const texts = values.rows.map((r) => r.points.trim());
  const points = texts.map(parsePoints);
  const hasEmpty = texts.some((t) => t === "");
  const pointsValid = !hasEmpty && points.every((p) => p !== null && isMultipleOf100(p));
  if (hasEmpty) {
    errors.push("4人分の素点を入力してください");
  } else if (!pointsValid) {
    errors.push("素点は100点単位で入力してください");
  }

  const kyotaku = parsePoints(values.kyotaku);
  const kyotakuValid = kyotaku !== null && kyotaku >= 0 && isMultipleOf100(kyotaku);
  if (!kyotakuValid) {
    errors.push("供託は0以上の100点単位で入力してください");
  }

  // 合計は、他の入力が正しいときだけ確認する
  if (pointsValid && kyotakuValid) {
    const { total } = calcTotal(values);
    if (total !== TOTAL_POINTS) {
      errors.push(
        `素点の合計と供託の合計が ${comma(TOTAL_POINTS)}点になっていません(現在: ${comma(total)}点)`,
      );
    }
  }

  return errors;
}

/** API に送る形にする。validate() で誤りがないことを確認してから使う */
export function toGameInput(values: GameFormValues): GameInput {
  return {
    played_on: values.playedOn,
    kyotaku: parsePoints(values.kyotaku) ?? 0,
    results: values.rows.map((row) => ({
      player_id: Number(row.playerId),
      points: parsePoints(row.points),
    })),
  };
}
