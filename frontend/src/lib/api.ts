import type {
  FieldError,
  Game,
  GameInput,
  Player,
  PlayerDetail,
  PlayerStats,
} from "./types";

// 開発中は、画面(localhost:3000)から API(localhost:8000)を直接呼ぶ。
// 本番は、画面と同じサーバーの /api に、Nginx が API へ転送する。
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000/api" : "/api");

export const NETWORK_ERROR_MESSAGE = "通信に失敗しました。しばらくしてからもう一度お試しください";

/** API がエラーを返したとき(または通信できなかったとき)の例外 */
export class ApiError extends Error {
  readonly status: number;
  readonly errors: FieldError[];

  constructor(status: number, message: string, errors: FieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }

  /** 画面に表示するメッセージの一覧。項目ごとのメッセージがあればそれを、なければ全体のメッセージ */
  get messages(): string[] {
    return this.errors.length > 0 ? this.errors.map((e) => e.message) : [this.message];
  }
}

/** どんな例外でも、画面に出すメッセージの一覧にする(ApiError 以外は通信失敗として扱う) */
export function errorMessages(error: unknown): string[] {
  return error instanceof ApiError ? error.messages : [NETWORK_ERROR_MESSAGE];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    // API が返す { message, errors } の形。それ以外(サーバーエラーなど)は共通のメッセージにする
    const body = await response.json().catch(() => null);
    if (body && typeof body.message === "string") {
      throw new ApiError(response.status, body.message, body.errors ?? []);
    }
    throw new ApiError(response.status, NETWORK_ERROR_MESSAGE);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

// ===== プレイヤー(A01〜A05) =====
export const listPlayers = () => request<Player[]>("/players");
export const createPlayer = (name: string) => request<Player>("/players", jsonBody("POST", { name }));
export const renamePlayer = (id: number, name: string) =>
  request<Player>(`/players/${id}`, jsonBody("PUT", { name }));
export const deletePlayer = (id: number) => request<void>(`/players/${id}`, { method: "DELETE" });
export const getPlayerDetail = (id: number) => request<PlayerDetail>(`/players/${id}`);

// ===== 成績一覧(A06) =====
export const listStats = () => request<PlayerStats[]>("/stats");

// ===== 対局(A07〜A11) =====
export const listGames = () => request<Game[]>("/games");
export const getGame = (id: number) => request<Game>(`/games/${id}`);
export const createGame = (input: GameInput) => request<Game>("/games", jsonBody("POST", input));
export const updateGame = (id: number, input: GameInput) =>
  request<Game>(`/games/${id}`, jsonBody("PUT", input));
export const deleteGame = (id: number) => request<void>(`/games/${id}`, { method: "DELETE" });
