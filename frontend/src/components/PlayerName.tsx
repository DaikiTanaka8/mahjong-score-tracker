import Link from "next/link";

export const DELETED_PLAYER_LABEL = "削除されたプレイヤー";

/**
 * プレイヤーの名前の表示。押すと、そのプレイヤーの詳細(S05)に移動する。
 * 削除済みのプレイヤーは、名前の代わりに「削除されたプレイヤー」を、リンクなしで表示する。
 */
export default function PlayerName({
  id,
  name,
  deleted,
}: {
  id: number;
  name: string;
  deleted: boolean;
}) {
  if (deleted) {
    return <span className="muted">{DELETED_PLAYER_LABEL}</span>;
  }
  return (
    <Link className="link" href={`/players/detail/?id=${id}`}>
      {name}
    </Link>
  );
}
