import type { Card } from "../poker/cards";

export type GameType = "holdem" | "draw";

export interface RoomConfig {
  gameType: GameType;
  smallBlind: number;
  bigBlind: number;
  ante: number; // draw only
  maxPlayers: number; // 2..8
  fillBots: boolean;
  startingChips: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isYou: boolean;
  isBot: boolean;
}

export interface LobbyState {
  code: string;
  hostId: string;
  status: "lobby" | "playing";
  config: RoomConfig;
  players: LobbyPlayer[];
  yourId: string;
}

export interface ViewPlayer {
  id: string;
  name: string;
  isBot: boolean;
  chips: number;
  bet: number;
  status: "active" | "folded" | "allin" | "out" | "empty";
  hole?: Card[] | null; // holdem
  hand?: Card[] | null; // draw
  hasDrawn?: boolean;
  drawnCount?: number;
}

export interface LegalActions {
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface GameView {
  gameType: GameType;
  stage: string;
  yourId: string;
  toActId: string | null;
  dealerId: string | null;
  players: ViewPlayer[];
  community?: Card[]; // holdem
  pot: number;
  currentBet: number;
  minRaise: number;
  log: string[];
  lastWinners: { id: string; name: string; amount: number; reason: string }[];
  handNumber: number;
  isHandOver: boolean;
  isGameOver: boolean;
  legal: LegalActions | null; // when it's your turn (betting)
  canDrawNow: boolean; // draw stage and it's your turn
  config: RoomConfig;
}

// === Client → Server ===
export type ClientMsg =
  | { type: "create"; payload: { name: string; config: RoomConfig } }
  | { type: "join"; payload: { code: string; name: string } }
  | { type: "leave" }
  | { type: "start" }
  | { type: "addBot" }
  | { type: "removeSeat"; payload: { seatId: string } } // host kicks a bot/player
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

// === Server → Client ===
export type ServerMsg =
  | { type: "welcome"; payload: { playerId: string } }
  | { type: "lobby"; payload: LobbyState }
  | { type: "game"; payload: GameView }
  | { type: "left" }
  | { type: "error"; payload: { message: string } };
