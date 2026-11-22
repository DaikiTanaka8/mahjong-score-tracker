// API が返すデータの型(docs/API設計.md のとおり)

export type Player = {
  id: number;
  name: string;
};

export type GameResult = {
  player_id: number;
  player_name: string;
  player_deleted: boolean;
  points: number; // 素点
  rank_from: number;
  rank_to: number;
  rank: number; // 表示用の順位。同点なら 1.5 など
  final_score: number;
};

export type Game = {
  id: number;
  played_on: string; // YYYY-MM-DD
  kyotaku: number; // 供託
  results: GameResult[]; // 順位順
};

/** 対局の登録・編集のリクエスト */
export type GameInput = {
  played_on: string;
  kyotaku: number;
  results: { player_id: number | null; points: number | null }[];
};

/** 成績。対局が0件のときは、対局数が0・順位の回数が全て0で、他は null */
export type Stats = {
  games_count: number;
  total_score: number | null;
  max_points: number | null; // 最高素点
  avg_rank: number | null;
  rank_counts: number[]; // 1位〜4位の回数(同点は按分した小数)
  top_rate: number | null; // 0〜1
  last_rate: number | null; // 0〜1
};

/** 成績一覧(A06)の1人分 */
export type PlayerStats = Stats & {
  player_id: number;
  name: string;
};

export type TableMate = {
  player_id: number;
  name: string;
  deleted: boolean;
  rank: number;
  points: number;
};

export type HistoryItem = {
  game_id: number;
  played_on: string;
  points: number;
  rank: number;
  final_score: number;
  table_mates: TableMate[];
};

/** プレイヤー詳細(A05) */
export type PlayerDetail = {
  player: { id: number; name: string; deleted: boolean };
  stats: Stats;
  history: HistoryItem[];
};

/** エラー応答の、項目ごとのメッセージ */
export type FieldError = {
  field: string;
  message: string;
};
