"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import PlayerName from "@/components/PlayerName";
import { LoadError, LoadingMessage } from "@/components/StatusMessages";
import { listStats } from "@/lib/api";
import {
  comma,
  formatAvgRank,
  formatCountFixed,
  formatPercent,
  formatScore,
  scoreClass,
} from "@/lib/format";
import { DEFAULT_SORT, nextSort, sortStats, type SortKey, type SortState } from "@/lib/statsSort";
import { useLoad } from "@/lib/useLoad";

const NONE = "-"; // 対局が0件のプレイヤーの、値の代わり

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  const ariaSort = !active ? "none" : sort.direction === "asc" ? "ascending" : "descending";
  return (
    <th rowSpan={2} className={sortKey === "name" ? "left" : "num"} aria-sort={ariaSort}>
      <button type="button" className="sort-button" onClick={() => onSort(sortKey)}>
        {label}
        {active && (sort.direction === "desc" ? " ▼" : " ▲")}
      </button>
    </th>
  );
}

/** S01 成績一覧(トップ画面)。項目名を押すと、並び替える */
export default function StatsPage() {
  const { data: stats, errors, loading, reload } = useLoad(listStats);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const rows = useMemo(() => (stats ? sortStats(stats, sort) : []), [stats, sort]);
  const onSort = (key: SortKey) => setSort((current) => nextSort(current, key));
  const header = { sort, onSort };

  return (
    <>
      <div className="toolbar">
        <h1>成績一覧</h1>
        <Link className="btn-cta" href="/games/new/">
          ＋ 対局を登録する
        </Link>
      </div>

      {loading && <LoadingMessage />}
      {!loading && errors.length > 0 && <LoadError messages={errors} onRetry={reload} />}

      {stats && stats.length === 0 && (
        <div className="card empty">
          プレイヤーが登録されていません。
          <div style={{ marginTop: 10 }}>
            <Link className="link" href="/players/">
              プレイヤー管理で登録する
            </Link>
          </div>
        </div>
      )}

      {stats && stats.length > 0 && (
        <>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <SortHeader label="名前" sortKey="name" {...header} />
                  <SortHeader label="対局数" sortKey="games_count" {...header} />
                  <SortHeader label="通算スコア" sortKey="total_score" {...header} />
                  <SortHeader label="平均順位" sortKey="avg_rank" {...header} />
                  <th className="center" colSpan={4}>
                    順位の回数
                  </th>
                  <SortHeader label="トップ率" sortKey="top_rate" {...header} />
                  <SortHeader label="ラス率" sortKey="last_rate" {...header} />
                  <SortHeader label="最高素点" sortKey="max_points" {...header} />
                </tr>
                <tr>
                  {[1, 2, 3, 4].map((rank) => (
                    <th key={rank} className="num">
                      {rank}位
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const played = s.games_count > 0;
                  return (
                    <tr key={s.player_id}>
                      <td>
                        <PlayerName id={s.player_id} name={s.name} deleted={false} />
                      </td>
                      <td className="num">{s.games_count}</td>
                      <td className={`num ${played ? scoreClass(s.total_score ?? 0) : ""}`}>
                        {played ? formatScore(s.total_score ?? 0) : NONE}
                      </td>
                      <td className="num">{played ? formatAvgRank(s.avg_rank ?? 0) : NONE}</td>
                      {s.rank_counts.map((count, i) => (
                        <td key={i} className="num">
                          {played ? formatCountFixed(count) : NONE}
                        </td>
                      ))}
                      <td className="num">{played ? formatPercent(s.top_rate ?? 0) : NONE}</td>
                      <td className="num">{played ? formatPercent(s.last_rate ?? 0) : NONE}</td>
                      <td className="num">{played ? comma(s.max_points ?? 0) : NONE}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">
            項目名を押すと並び替えできます。削除済みのプレイヤーは表示されません。
          </p>
        </>
      )}
    </>
  );
}
