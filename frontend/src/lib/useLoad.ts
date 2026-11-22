"use client";

import { useCallback, useEffect, useState } from "react";

import { errorMessages } from "./api";

type LoadState<T> = {
  data: T | undefined;
  errors: string[]; // 取得に失敗したときのメッセージ
  loading: boolean;
};

/**
 * 画面を開いたときに、API からデータを取得する。
 *
 * - loader は、毎回同じ関数を渡す(`listPlayers` のようなモジュールの関数、または useCallback で包んだ関数)
 * - reload() で、取得し直す。取得し直している間も、前のデータは表示し続ける(画面がちらつかない)
 */
export function useLoad<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ data: undefined, errors: [], loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false; // 画面を離れたあとに届いた結果で、画面を更新しない
    loader().then(
      (data) => {
        if (!cancelled) setState({ data, errors: [], loading: false });
      },
      (error: unknown) => {
        if (!cancelled) setState({ data: undefined, errors: errorMessages(error), loading: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loader, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { ...state, reload };
}
