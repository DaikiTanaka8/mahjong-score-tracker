"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const TOAST_DURATION_MS = 2200;

type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast | null>(null);

/**
 * 「登録しました」などの成功メッセージを、画面の上部に短く表示する。
 * レイアウトに1つ置くので、画面を移動したあとも、メッセージが消えずに表示される
 * (例: 対局を登録して一覧に戻ったときに「対局を登録しました」と出す)。
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ShowToast>((text) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** 成功メッセージを出す関数を返す。使い方: `const toast = useToast(); toast("登録しました");` */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast は ToastProvider の中で使ってください");
  return show;
}
