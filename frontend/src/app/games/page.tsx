"use client";

import Link from "next/link";
import { useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import GameCard from "@/components/GameCard";
import { ErrorList, LoadError, LoadingMessage } from "@/components/StatusMessages";
import { useToast } from "@/components/ToastProvider";
import { deleteGame, errorMessages, listGames } from "@/lib/api";
import type { Game } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

/** S02 対局一覧(対局日の新しい順。並び順は API が決める) */
export default function GamesPage() {
  const { data: games, errors: loadErrors, loading, reload } = useLoad(listGames);
  const toast = useToast();

  // 削除(確認ダイアログを出している間、対象の対局が入る)
  const [deleting, setDeleting] = useState<Game | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteGame(deleting.id);
      setDeleteErrors([]);
      toast("対局を削除しました");
    } catch (error) {
      setDeleteErrors(errorMessages(error));
    } finally {
      setDeleting(null);
      setBusy(false);
      reload(); // 失敗した場合(すでに削除済みなど)も、最新の一覧にする
    }
  }

  return (
    <>
      <div className="toolbar">
        <h1>対局一覧</h1>
        <Link className="btn-cta" href="/games/new/">
          ＋ 対局を登録する
        </Link>
      </div>

      <ErrorList messages={deleteErrors} />

      {loading && <LoadingMessage />}
      {!loading && loadErrors.length > 0 && <LoadError messages={loadErrors} onRetry={reload} />}
      {games && games.length === 0 && <div className="card empty">対局が登録されていません。</div>}
      {games?.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          onDelete={(target) => {
            setDeleteErrors([]);
            setDeleting(target);
          }}
        />
      ))}

      {deleting && (
        <ConfirmDialog
          title="対局の削除"
          message={`この対局(${deleting.played_on})を削除しますか?\n元に戻せません。`}
          confirmLabel="削除する"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
