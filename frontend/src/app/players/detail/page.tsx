"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";

import PlayerName from "@/components/PlayerName";
import { LoadError, LoadingMessage } from "@/components/StatusMessages";
import { ApiError, getPlayerDetail } from "@/lib/api";
import {
  comma,
  formatAvgRank,
  formatPercent,
  formatScore,
  formatTrimmed,
  scoreClass,
} from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

const NOT_FOUND = "プレイヤーが見つかりません";
const NONE = "-"; // 対局が0件のときの、値の代わり

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className="v">{children}</div>
    </div>
  );
}

/** S05 プレイヤー詳細。プレイヤーのIDは、URL の ?id= で受け取る(静的エクスポートのため) */
function PlayerDetail() {
  const id = Number(useSearchParams().get("id"));
  const validId = Number.isInteger(id) && id > 0;

  const load = useCallback(
    () => (validId ? getPlayerDetail(id) : Promise.reject(new ApiError(404, NOT_FOUND))),
    [id, validId],
  );
  const { data: detail, errors, loading, reload } = useLoad(load);

  if (loading) {
    return (
      <>
        <h1>プレイヤー詳細</h1>
        <LoadingMessage />
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <h1>プレイヤー詳細</h1>
        <LoadError messages={errors} onRetry={reload} />
        <Link className="link" href="/">
          成績一覧へ戻る
        </Link>
      </>
    );
  }

  const { player, stats, history } = detail;
  const played = stats.games_count > 0;

  return (
    <>
      <h1>
        {player.name}さんの成績{" "}
        {player.deleted && <span className="badge">削除済み</span>}
      </h1>

      <div className="stats">
        <Stat label="対局数">{stats.games_count}</Stat>
        <Stat label="通算スコア">
          {played ? (
            <span className={scoreClass(stats.total_score ?? 0)}>
              {formatScore(stats.total_score ?? 0)}
            </span>
          ) : (
            NONE
          )}
        </Stat>
        <Stat label="最高素点">{played ? comma(stats.max_points ?? 0) : NONE}</Stat>
        <Stat label="平均順位">{played ? formatAvgRank(stats.avg_rank ?? 0) : NONE}</Stat>
        <Stat label="トップ率">{played ? formatPercent(stats.top_rate ?? 0) : NONE}</Stat>
        <Stat label="ラス率">{played ? formatPercent(stats.last_rate ?? 0) : NONE}</Stat>
      </div>

      <div className="card">
        順位の回数:{" "}
        {played
          ? stats.rank_counts.map((count, i) => (
              <span key={i} style={{ marginRight: 16 }}>
                <b>{i + 1}位</b> {formatTrimmed(count)}回
              </span>
            ))
          : NONE}
      </div>

      <h2>対局履歴</h2>
      {history.length === 0 ? (
        <div className="card empty">対局がありません。</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>対局日</th>
                <th>順位</th>
                <th>素点</th>
                <th>スコア</th>
                <th className="left">同卓者(順位・点数)</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.game_id}>
                  <td>{item.played_on}</td>
                  <td className="num">{formatTrimmed(item.rank)}</td>
                  <td className="num">{comma(item.points)}</td>
                  <td className={`num ${scoreClass(item.final_score)}`}>
                    {formatScore(item.final_score)}
                  </td>
                  <td className="tablemates">
                    {item.table_mates.map((mate) => (
                      <span key={mate.player_id}>
                        <PlayerName id={mate.player_id} name={mate.name} deleted={mate.deleted} />{" "}
                        {formatTrimmed(mate.rank)}位 {comma(mate.points)}点
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function PlayerDetailPage() {
  // useSearchParams を使う部品は、Suspense で包む必要がある(静的エクスポートの決まり)
  return (
    <Suspense fallback={<LoadingMessage />}>
      <PlayerDetail />
    </Suspense>
  );
}
