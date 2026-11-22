"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import GameForm from "@/components/GameForm";
import { LoadError, LoadingMessage } from "@/components/StatusMessages";
import { useToast } from "@/components/ToastProvider";
import { createGame, listPlayers } from "@/lib/api";
import { PLAYER_COUNT, emptyForm } from "@/lib/gameForm";
import type { GameInput } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

/** S03 対局登録 */
export default function NewGamePage() {
  const router = useRouter();
  const toast = useToast();
  const { data: players, errors, loading, reload } = useLoad(listPlayers);
  const initial = useMemo(() => emptyForm(), []); // 画面を開いたときの日付で、固定する

  async function handleSubmit(input: GameInput) {
    await createGame(input);
    toast("対局を登録しました");
    router.push("/games/");
  }

  return (
    <>
      <h1>対局を登録する</h1>

      {loading && <LoadingMessage />}
      {!loading && errors.length > 0 && <LoadError messages={errors} onRetry={reload} />}

      {players && players.length < PLAYER_COUNT && (
        <div className="card empty">
          対局を登録するには、プレイヤーが{PLAYER_COUNT}人以上必要です(今: {players.length}人)。
          <div style={{ marginTop: 10 }}>
            <Link className="link" href="/players/">
              プレイヤー管理で登録する
            </Link>
          </div>
        </div>
      )}

      {players && players.length >= PLAYER_COUNT && (
        <GameForm
          initial={initial}
          players={players}
          submitLabel="登録する"
          onSubmit={handleSubmit}
          onCancel={() => router.push("/games/")}
        />
      )}
    </>
  );
}
