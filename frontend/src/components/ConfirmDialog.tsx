"use client";

import { useEffect } from "react";

type Props = {
  title: string;
  message: string;
  confirmLabel: string; // 例: 「削除する」
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean; // 処理中は、ボタンを押せなくする
};

/** 「本当に削除しますか?」のような、確認のダイアログ。表示するときだけ画面に置く。 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: Props) {
  // Esc キーで、キャンセルする
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p className="modal-message">{message}</p>
        <div className="actions">
          {/* 誤って確定しないよう、最初に選ばれるのは「キャンセル」 */}
          <button type="button" onClick={onCancel} disabled={busy} autoFocus>
            キャンセル
          </button>
          <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
