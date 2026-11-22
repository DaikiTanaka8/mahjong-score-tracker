"use client";

import Link from "next/link";
import { useState, type FormEvent, type KeyboardEvent } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import { ErrorList, LoadError, LoadingMessage } from "@/components/StatusMessages";
import { useToast } from "@/components/ToastProvider";
import { createPlayer, deletePlayer, errorMessages, listPlayers, renamePlayer } from "@/lib/api";
import type { Player } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

/** S04 プレイヤー管理: 登録・名前の編集・削除(論理削除) */
export default function PlayersPage() {
  const { data: players, errors: loadErrors, loading, reload } = useLoad(listPlayers);
  const toast = useToast();

  // 新規登録
  const [newName, setNewName] = useState("");
  const [createErrors, setCreateErrors] = useState<string[]>([]);

  // 名前の編集(編集中の行は、名前が入力欄に変わる)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editErrors, setEditErrors] = useState<string[]>([]);

  // 削除(確認ダイアログを出している間、対象のプレイヤーが入る)
  const [deleting, setDeleting] = useState<Player | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);

  const [busy, setBusy] = useState(false); // 通信中は、二重に押せないようにする

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await createPlayer(newName);
      setNewName("");
      setCreateErrors([]);
      toast("プレイヤーを登録しました");
      reload();
    } catch (error) {
      setCreateErrors(errorMessages(error));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(player: Player) {
    setEditingId(player.id);
    setEditName(player.name);
    setEditErrors([]);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditErrors([]);
  }

  async function saveEdit(id: number) {
    setBusy(true);
    try {
      await renamePlayer(id, editName);
      setEditingId(null);
      setEditErrors([]);
      toast("名前を変更しました");
      reload();
    } catch (error) {
      setEditErrors(errorMessages(error));
    } finally {
      setBusy(false);
    }
  }

  function handleEditKeyDown(event: KeyboardEvent, id: number) {
    if (event.key === "Enter") saveEdit(id);
    if (event.key === "Escape") cancelEdit();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deletePlayer(deleting.id);
      setDeleteErrors([]);
      toast("プレイヤーを削除しました");
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
      <h1>プレイヤー管理</h1>

      <div className="card">
        <form className="formrow" style={{ margin: 0 }} onSubmit={handleCreate}>
          <label className="l" htmlFor="new-name" style={{ width: "auto" }}>
            新規登録
          </label>
          <input
            id="new-name"
            value={newName}
            placeholder="名前を入力"
            onChange={(event) => setNewName(event.target.value)}
          />
          <button type="submit" className="primary" disabled={busy}>
            登録する
          </button>
        </form>
        <ErrorList messages={createErrors} />
      </div>

      <ErrorList messages={deleteErrors} />

      {loading && <LoadingMessage />}
      {!loading && loadErrors.length > 0 && <LoadError messages={loadErrors} onRetry={reload} />}
      {players && players.length === 0 && <div className="card empty">プレイヤーが登録されていません。</div>}
      {players && players.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>名前</th>
                <th style={{ textAlign: "right" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) =>
                editingId === player.id ? (
                  <tr key={player.id}>
                    <td>
                      <input
                        aria-label="名前"
                        value={editName}
                        autoFocus
                        onChange={(event) => setEditName(event.target.value)}
                        onKeyDown={(event) => handleEditKeyDown(event, player.id)}
                      />
                      <ErrorList messages={editErrors} />
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={busy}
                          onClick={() => saveEdit(player.id)}
                        >
                          保存
                        </button>
                        <button type="button" disabled={busy} onClick={cancelEdit}>
                          キャンセル
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={player.id}>
                    <td>
                      <Link className="link" href={`/players/detail/?id=${player.id}`}>
                        {player.name}
                      </Link>
                    </td>
                    <td>
                      <div className="actions">
                        <button type="button" onClick={() => startEdit(player)}>
                          編集
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setDeleteErrors([]);
                            setDeleting(player);
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title="プレイヤーの削除"
          message={`${deleting.name}さんを削除しますか?\n過去の対局は残り、「削除されたプレイヤー」と表示されます。`}
          confirmLabel="削除する"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
