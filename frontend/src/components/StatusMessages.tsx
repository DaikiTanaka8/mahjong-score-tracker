/** データを読み込んでいる間の表示 */
export function LoadingMessage() {
  return <div className="card empty">読み込み中...</div>;
}

/** データの取得に失敗したときの表示。「再読み込み」で、もう一度取得する */
export function LoadError({ messages, onRetry }: { messages: string[]; onRetry: () => void }) {
  return (
    <div className="error-box" role="alert">
      {messages.map((message) => (
        <div key={message}>{message}</div>
      ))}
      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={onRetry}>
          再読み込み
        </button>
      </div>
    </div>
  );
}

/** 入力の誤りなど、操作の失敗を伝えるメッセージ(フォームの下などに置く) */
export function ErrorList({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="errors" role="alert">
      {messages.map((message) => (
        <div key={message}>{message}</div>
      ))}
    </div>
  );
}
