// Mirror of artifacts/api-server/src/lib/protocol.ts (kept in sync manually)
import type { Card } from "./cards";

export type GameType = "holdem" | "draw";
export type LobbyPhase = "lobby" | "buyIn";

export interface RoomConfig {
  gameType: GameType;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  maxPlayers: number;
  isPublic: boolean;
  startingChips: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isYou: boolean;
  pendingKick?: boolean;
}

export interface LobbyState {
  code: string;
  hostId: string;
  status: "lobby" | "playing";
  phase: LobbyPhase;
  config: RoomConfig;
  players: LobbyPlayer[];
  yourId: string;
  yourBuyIn: number | null;
  buyInDeadline: number | null;
  buyInsSubmitted: string[];
}

export interface ViewPlayer {
  id: string;
  name: string;
  chips: number;
  bet: number;
  status: "active" | "folded" | "allin" | "out";
  hole?: Card[] | null;
  hand?: Card[] | null;
  hasDrawn?: boolean;
  drawnCount?: number;
  disconnected?: boolean;
  pendingKick?: boolean;
  isHost?: boolean;
}

export interface LegalActions {
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface PublicRoomInfo {
  code: string;
  gameType: GameType;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  playerCount: number;
  maxPlayers: number;
  status: "lobby" | "playing";
  handNumber: number;
}

export interface GameView {
  gameType: GameType;
  stage: string;
  yourId: string;
  hostId: string;
  toActId: string | null;
  dealerId: string | null;
  players: ViewPlayer[];
  community?: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  log: string[];
  lastWinners: { id: string; name: string; amount: number; reason: string }[];
  handNumber: number;
  isHandOver: boolean;
  isGameOver: boolean;
  legal: LegalActions | null;
  canDrawNow: boolean;
  config: RoomConfig;
  depositDeadline: number | null;
  yourDepositSubmitted: boolean;
  pendingJoinsCount: number;
}

export type ClientMsg =
  | { type: "create"; payload: { name: string; config: RoomConfig } }
  | { type: "join"; payload: { code: string; name: string } }
  | { type: "leave" }
  | { type: "start" }
  | { type: "buyIn"; payload: { amount: number } }
  | { type: "deposit"; payload: { amount: number } }
  | { type: "kick"; payload: { seatId: string } }
  | { type: "listPublic" }
  | {
      type: "action";
      payload:
        | { kind: "fold" }
        | { kind: "check" }
        | { kind: "call" }
        | { kind: "bet"; amount: number }
        | { kind: "raise"; toAmount: number }
        | { kind: "draw"; discardIdxs: number[] };
    }
  | { type: "nextHand" };

export type ServerMsg =
  | { type: "welcome"; payload: { playerId: string } }
  | { type: "lobby"; payload: LobbyState }
  | { type: "game"; payload: GameView }
  | { type: "left"; payload: { refundChips: number } }
  | { type: "bankCredit"; payload: { amount: number; reason: string } }
  | { type: "publicRooms"; payload: PublicRoomInfo[] }
  | { type: "error"; payload: { message: string } };
