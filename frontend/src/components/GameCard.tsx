import Link from "next/link";

import PlayerName from "@/components/PlayerName";
import { comma, formatScore, formatTrimmed, scoreClass } from "@/lib/format";
import type { Game } from "@/lib/types";

/** 対局1件のカード。対局日・供託・編集/削除ボタンと、4人分の結果の表 */
export default function GameCard({
  game,
  onDelete,
}: {
  game: Game;
  onDelete: (game: Game) => void;
}) {
  return (
    <div className="game">
      <div className="game-head">
        <span className="date">{game.played_on}</span>
        <span className="spacer" />
        {game.kyotaku > 0 && <span className="kyotaku">※供託 {comma(game.kyotaku)}点</span>}
        <Link className="btn" href={`/games/edit/?id=${game.id}`}>
          編集
        </Link>
        <button type="button" className="danger" onClick={() => onDelete(game)}>
          削除
        </button>
      </div>
      <table>
        {/* 列の幅を固定して、どの対局の表でも、列が縦にそろうようにする */}
        <colgroup>
          <col style={{ width: "34%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>名前</th>
            <th>順位</th>
            <th>素点</th>
            <th>スコア</th>
          </tr>
        </thead>
        <tbody>
          {game.results.map((result) => (
            <tr key={result.player_id}>
              <td>
                <PlayerName
                  id={result.player_id}
                  name={result.player_name}
                  deleted={result.player_deleted}
                />
              </td>
              <td className="num">{formatTrimmed(result.rank)}</td>
              <td className="num">{comma(result.points)}</td>
              <td className={`num ${scoreClass(result.final_score)}`}>
                {formatScore(result.final_score)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
