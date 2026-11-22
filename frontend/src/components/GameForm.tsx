"use client";

import { useState, type FormEvent } from "react";

import { ErrorList } from "@/components/StatusMessages";
import { errorMessages } from "@/lib/api";
import { comma } from "@/lib/format";
import { calcTotal, toGameInput, validate, type GameFormValues } from "@/lib/gameForm";
import type { GameInput } from "@/lib/types";

/** プレイヤーの選択肢。deleted は、削除済みだが、この対局にもともと参加している人 */
export type PlayerOption = { id: number; name: string; deleted?: boolean };

type Props = {
  initial: GameFormValues;
  players: PlayerOption[];
  submitLabel: string; // 「登録する」「更新する」
  /** 保存する。失敗したときは、例外(ApiError)を投げる。成功したら、呼び出し元が画面を移動する */
  onSubmit: (input: GameInput) => Promise<void>;
  onCancel: () => void;
};

/** S03 対局登録・編集の入力フォーム(登録と編集で共通) */
export default function GameForm({ initial, players, submitLabel, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState(false); // 入力を始めたら、誤りの文章を表示する
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const errors = validate(values);
  const { pointsSum, kyotaku, total, diff } = calcTotal(values);

  function change(next: GameFormValues) {
    setValues(next);
    setTouched(true);
    setServerErrors([]);
  }

  function changeRow(index: number, patch: Partial<GameFormValues["rows"][number]>) {
    change({
      ...values,
      rows: values.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (errors.length > 0) return;
    setBusy(true);
    try {
      await onSubmit(toGameInput(values));
    } catch (error) {
      setServerErrors(errorMessages(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="formrow">
        <label className="l" htmlFor="played-on">
          対局日
        </label>
        <input
          id="played-on"
          type="date"
          value={values.playedOn}
          onChange={(event) => change({ ...values, playedOn: event.target.value })}
        />
      </div>

      <div className="formrow">
        <label className="l" htmlFor="kyotaku">
          供託
        </label>
        <input
          id="kyotaku"
          type="number"
          step={100}
          value={values.kyotaku}
          onChange={(event) => change({ ...values, kyotaku: event.target.value })}
        />
        <span>点</span>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "16px 0" }} />

      {values.rows.map((row, index) => {
        // 他の欄で選んだプレイヤーは、選べないようにする
        const chosenElsewhere = new Set(
          values.rows.filter((_, i) => i !== index).map((r) => r.playerId),
        );
        return (
          <div className="formrow" key={index}>
            <span className="l">{index + 1}人目</span>
            <select
              aria-label={`${index + 1}人目のプレイヤー`}
              value={row.playerId}
              onChange={(event) => changeRow(index, { playerId: event.target.value })}
            >
              <option value="">プレイヤーを選択</option>
              {players.map((player) => (
                <option
                  key={player.id}
                  value={String(player.id)}
                  disabled={chosenElsewhere.has(String(player.id))}
                >
                  {player.name}
                  {player.deleted ? "(削除済み)" : ""}
                </option>
              ))}
            </select>
            <span className="muted">素点</span>
            <input
              aria-label={`${index + 1}人目の素点`}
              type="number"
              step={100}
              placeholder="例: 32500"
              value={row.points}
              onChange={(event) => changeRow(index, { points: event.target.value })}
            />
            <span>点</span>
          </div>
        );
      })}

      <div className={`sumbox${diff === 0 ? " ok" : ""}`} aria-live="polite">
        合計: 素点 {comma(pointsSum)} + 供託 {comma(kyotaku)} = {comma(total)} 点{" "}
        {diff === 0 && "(OK)"}
        {diff > 0 && `(あと ${comma(diff)} 点)`}
        {diff < 0 && `(${comma(-diff)} 点 多い)`}
      </div>

      <ErrorList messages={[...(touched ? errors : []), ...serverErrors]} />

      <div className="actions" style={{ marginTop: 16 }}>
        <button type="button" onClick={onCancel} disabled={busy}>
          キャンセル
        </button>
        <button type="submit" className="primary" disabled={errors.length > 0 || busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
