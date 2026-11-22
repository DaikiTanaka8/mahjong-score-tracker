"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo } from "react";

import GameForm, { type PlayerOption } from "@/components/GameForm";
import { LoadError, LoadingMessage } from "@/components/StatusMessages";
import { useToast } from "@/components/ToastProvider";
import { ApiError, getGame, listPlayers, updateGame } from "@/lib/api";
import { formFromGame } from "@/lib/gameForm";
import type { GameInput } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

const NOT_FOUND = "対局が見つかりません";

/** S03 対局編集。対局のIDは、URL の ?id= で受け取る(静的エクスポートのため) */
function EditGame() {
  const router = useRouter();
  const toast = useToast();
  const id = Number(useSearchParams().get("id"));
  const validId = Number.isInteger(id) && id > 0;

  const loadGame = useCallback(
    () => (validId ? getGame(id) : Promise.reject(new ApiError(404, NOT_FOUND))),
    [id, validId],
  );
  const gameLoad = useLoad(loadGame);
  const playersLoad = useLoad(listPlayers);

  const game = gameLoad.data;
  const players = playersLoad.data;

  // 選択肢: 削除されていないプレイヤー + この対局にもともと参加している削除済みのプレイヤー
  const options = useMemo<PlayerOption[]>(() => {
    if (!game || !players) return [];
    const list: PlayerOption[] = [...players];
    for (const result of game.results) {
      if (!list.some((p) => p.id === result.player_id)) {
        list.push({ id: result.player_id, name: result.player_name, deleted: true });
      }
    }
    return list;
  }, [game, players]);

  const errors = [...gameLoad.errors, ...playersLoad.errors];
  const loading = gameLoad.loading || playersLoad.loading;
  const reload = () => {
    gameLoad.reload();
    playersLoad.reload();
  };

  async function handleSubmit(input: GameInput) {
    await updateGame(id, input);
    toast("対局を更新しました");
    router.push("/games/");
  }

  return (
    <>
      <h1>対局を編集する</h1>

      {loading && <LoadingMessage />}
      {!loading && errors.length > 0 && (
        <>
          <LoadError messages={errors} onRetry={reload} />
          <Link className="link" href="/games/">
            対局一覧へ戻る
          </Link>
        </>
      )}

      {game && players && (
        <GameForm
          key={game.id}
          initial={formFromGame(game)}
          players={options}
          submitLabel="更新する"
          onSubmit={handleSubmit}
          onCancel={() => router.push("/games/")}
        />
      )}
    </>
  );
}

export default function EditGamePage() {
  // useSearchParams を使う部品は、Suspense で包む必要がある(静的エクスポートの決まり)
  return (
    <Suspense fallback={<LoadingMessage />}>
      <EditGame />
    </Suspense>
  );
}
