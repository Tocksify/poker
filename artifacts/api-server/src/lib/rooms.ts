import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  type HoldemState,
  type Player as HoldemPlayer,
  applyAction,
  botDecide,
  isHandOver as isHoldemOver,
  legalActions as holdemLegal,
  startHand as startHoldemHand,
  gameOver as holdemGameOver,
} from "../poker/holdem";
import {
  type DrawState,
  type DrawPlayer,
  applyDrawAction,
  botDecideDraw,
  isHandOverDraw,
  legalDrawActions,
  startDrawHand,
  gameOverDraw,
} from "../poker/draw";
import { makeDeck, shuffle } from "../poker/cards";
import type {
  ClientMsg,
  GameView,
  LobbyPlayer,
  LobbyState,
  PublicRoomInfo,
  RoomConfig,
  ServerMsg,
  ViewPlayer,
} from "./protocol";

const BOT_NAMES = [
  "Lucky",
  "Doc",
  "Slim",
  "Maverick",
  "Riggs",
  "Vegas",
  "Diamond",
  "Ace",
];

const BUYIN_WINDOW_MS = 10_000;
const DEPOSIT_WINDOW_MS = 10_000;

export interface Seat {
  playerId: string;
  name: string;
  isBot: boolean;
  chips: number; // chips at this seat (mirrors engine after each action)
  buyIn: number; // amount they brought from their bank for this game
  disconnected: boolean;
  pendingKick: boolean;
  joinedDuringGame: boolean; // joined mid-game; not yet seated in engine
}

interface BaseRoom {
  code: string;
  hostId: string;
  config: RoomConfig;
  seats: (Seat | null)[]; // length === maxPlayers
  status: "lobby" | "playing";
  game:
    | { type: "holdem"; state: HoldemState }
    | { type: "draw"; state: DrawState }
    | null;
  seatMap: string[]; // engine player index → seat playerId
  sockets: Map<string, WebSocket>;
  botTimer: NodeJS.Timeout | null;
  // Lobby buy-in window
  buyInDeadline: number | null;
  buyInsSubmitted: Map<string, number>; // playerId → amount
  buyInTimer: NodeJS.Timeout | null;
  // Between-hand deposit window
  depositDeadline: number | null;
  depositsSubmitted: Set<string>;
}

const ROOMS = new Map<string, BaseRoom>();
const PLAYER_TO_ROOM = new Map<string, string>();

function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 5; i++)
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (ROOMS.has(code));
  return code;
}

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendError(ws: WebSocket, message: string) {
  send(ws, { type: "error", payload: { message } });
}

function sendTo(room: BaseRoom, playerId: string, msg: ServerMsg) {
  const sock = room.sockets.get(playerId);
  if (sock) send(sock, msg);
}

function getCurrentHandNumber(room: BaseRoom): number {
  if (!room.game) return 0;
  return room.game.state.handNumber;
}

function buildLobbyState(room: BaseRoom, viewerId: string): LobbyState {
  const players: LobbyPlayer[] = [];
  for (const seat of room.seats) {
    if (!seat) continue;
    if (seat.isBot) continue; // bots aren't listed in the lobby player list anymore
    players.push({
      id: seat.playerId,
      name: seat.name,
      isHost: seat.playerId === room.hostId,
      isYou: seat.playerId === viewerId,
      pendingKick: seat.pendingKick,
    });
  }
  const phase: "lobby" | "buyIn" =
    room.buyInDeadline != null ? "buyIn" : "lobby";
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    phase,
    config: room.config,
    players,
    yourId: viewerId,
    yourBuyIn: room.buyInsSubmitted.get(viewerId) ?? null,
    buyInDeadline: room.buyInDeadline,
    buyInsSubmitted: Array.from(room.buyInsSubmitted.keys()),
  };
}

function broadcastLobby(room: BaseRoom) {
  for (const [pid, sock] of room.sockets.entries()) {
    send(sock, { type: "lobby", payload: buildLobbyState(room, pid) });
  }
}

function broadcastGame(room: BaseRoom) {
  for (const [pid, sock] of room.sockets.entries()) {
    const view = buildGameView(room, pid);
    if (view) send(sock, { type: "game", payload: view });
  }
}

function buildGameView(room: BaseRoom, viewerId: string): GameView | null {
  const game = room.game;
  if (!game) return null;
  const players: ViewPlayer[] = [];
  const handOver =
    game.type === "holdem"
      ? isHoldemOver(game.state)
      : isHandOverDraw(game.state);

  const enginePlayers = game.state.players as (HoldemPlayer | DrawPlayer)[];
  for (let i = 0; i < enginePlayers.length; i++) {
    const sp = enginePlayers[i];
    const seatPid = room.seatMap[i] ?? "";
    const seat = room.seats.find((s) => s !== null && s.playerId === seatPid);
    if (!seatPid || !seat) {
      // empty slot — don't render
      continue;
    }
    const isMine = seatPid === viewerId;
    const showHole =
      isMine ||
      (handOver && sp.status !== "folded" && sp.status !== "out");
    const cards =
      game.type === "holdem"
        ? (sp as HoldemPlayer).hole
        : (sp as DrawPlayer).hand;
    const cardsField =
      game.type === "holdem"
        ? {
            hole: cards.length > 0 ? (showHole ? cards : null) : [],
          }
        : {
            hand: cards.length > 0 ? (showHole ? cards : null) : [],
            hasDrawn: (sp as DrawPlayer).hasDrawn,
            drawnCount: (sp as DrawPlayer).drawnCount,
          };
    players.push({
      id: seatPid,
      name: seat.name,
      chips: sp.chips,
      bet: sp.bet,
      status: sp.status,
      ...cardsField,
      disconnected: seat.disconnected,
      pendingKick: seat.pendingKick,
      isHost: seatPid === room.hostId,
    });
  }

  const toActPid = room.seatMap[game.state.toActIdx] ?? null;
  const dealerPid = room.seatMap[game.state.dealerIdx] ?? null;
  const isYourTurn = toActPid === viewerId;

  let legal: GameView["legal"] = null;
  let canDrawNow = false;
  if (isYourTurn && !handOver) {
    if (game.type === "holdem") {
      legal = holdemLegal(game.state);
    } else {
      const ds = game.state;
      if (ds.stage === "drawing") canDrawNow = true;
      else if (ds.stage === "predraw" || ds.stage === "postdraw")
        legal = legalDrawActions(ds);
    }
  }

  const pendingJoinsCount = room.seats.filter(
    (s): s is Seat => s !== null && s.joinedDuringGame,
  ).length;

  return {
    gameType: game.type,
    stage: game.state.stage,
    yourId: viewerId,
    hostId: room.hostId,
    toActId: toActPid,
    dealerId: dealerPid,
    players,
    community: game.type === "holdem" ? game.state.community : undefined,
    pot: game.state.pot,
    currentBet: game.state.currentBet,
    minRaise: game.state.minRaise,
    log: game.state.log,
    handNumber: game.state.handNumber,
    lastWinners: game.state.lastWinners.map((w) => ({
      id: room.seatMap[w.id] ?? "",
      name: w.name,
      amount: w.amount,
      reason: w.reason,
    })),
    isHandOver: handOver,
    isGameOver:
      game.type === "holdem"
        ? holdemGameOver(game.state)
        : gameOverDraw(game.state),
    legal,
    canDrawNow,
    config: room.config,
    depositDeadline: handOver ? room.depositDeadline : null,
    yourDepositSubmitted: room.depositsSubmitted.has(viewerId),
    pendingJoinsCount,
  };
}

// ---------- Engine builders ----------

function buildHoldemState(seats: (Seat | null)[], cfg: RoomConfig): HoldemState {
  const players: HoldemPlayer[] = seats.map((s, i) => ({
    id: i,
    name: s ? s.name : "(empty)",
    isHuman: s ? !s.isBot : false,
    chips: s ? s.chips : 0,
    hole: [],
    bet: 0,
    totalBet: 0,
    status: s && s.chips > 0 ? "active" : "out",
    hasActed: false,
  }));
  const state: HoldemState = {
    config: {
      players: seats.map((s) => ({
        name: s ? s.name : "(empty)",
        isHuman: s ? !s.isBot : false,
      })),
      startingChips: 0,
      smallBlind: cfg.smallBlind,
      bigBlind: cfg.bigBlind,
      ante: cfg.ante,
    },
    players,
    dealerIdx: 0,
    toActIdx: 0,
    stage: "preflop",
    community: [],
    deck: shuffle(makeDeck()),
    pot: 0,
    currentBet: 0,
    minRaise: cfg.bigBlind,
    log: [],
    handNumber: 0,
    lastWinners: [],
  };
  startHoldemHand(state);
  return state;
}

function buildDrawState(seats: (Seat | null)[], cfg: RoomConfig): DrawState {
  const players: DrawPlayer[] = seats.map((s, i) => ({
    id: i,
    name: s ? s.name : "(empty)",
    isHuman: s ? !s.isBot : false,
    chips: s ? s.chips : 0,
    hand: [],
    bet: 0,
    totalBet: 0,
    status: s && s.chips > 0 ? "active" : "out",
    hasActed: false,
    hasDrawn: false,
    drawnCount: 0,
  }));
  const state: DrawState = {
    config: {
      players: seats.map((s) => ({
        name: s ? s.name : "(empty)",
        isHuman: s ? !s.isBot : false,
      })),
      startingChips: 0,
      ante: cfg.ante,
      smallBlind: cfg.smallBlind,
      bigBlind: cfg.bigBlind,
    },
    players,
    dealerIdx: 0,
    toActIdx: 0,
    stage: "predraw",
    deck: shuffle(makeDeck()),
    pot: 0,
    currentBet: 0,
    minRaise: cfg.bigBlind,
    log: [],
    handNumber: 0,
    lastWinners: [],
  };
  startDrawHand(state);
  return state;
}

// ---------- Buy-in window ----------

function startBuyInWindow(room: BaseRoom) {
  room.buyInDeadline = Date.now() + BUYIN_WINDOW_MS;
  room.buyInsSubmitted.clear();
  if (room.buyInTimer) clearTimeout(room.buyInTimer);
  room.buyInTimer = setTimeout(() => {
    finishBuyInWindow(room);
  }, BUYIN_WINDOW_MS + 100);
  broadcastLobby(room);
}

function finishBuyInWindow(room: BaseRoom) {
  if (room.buyInTimer) {
    clearTimeout(room.buyInTimer);
    room.buyInTimer = null;
  }
  room.buyInDeadline = null;
  // For each seated human, apply their buy-in. If none submitted, kick them.
  const toKick: string[] = [];
  for (const seat of room.seats) {
    if (!seat) continue;
    if (seat.isBot) {
      // Bots get the configured starting chips (or 1000 default)
      seat.chips = room.config.startingChips || 1000;
      seat.buyIn = seat.chips;
      continue;
    }
    const buyIn = room.buyInsSubmitted.get(seat.playerId) ?? 0;
    if (buyIn <= 0) {
      // didn't buy in — kick from room
      toKick.push(seat.playerId);
    } else {
      seat.chips = buyIn;
      seat.buyIn = buyIn;
    }
  }
  for (const pid of toKick) {
    const idx = room.seats.findIndex(
      (s) => s !== null && s.playerId === pid,
    );
    if (idx >= 0) {
      const sock = room.sockets.get(pid);
      room.seats[idx] = null;
      room.sockets.delete(pid);
      PLAYER_TO_ROOM.delete(pid);
      if (sock) send(sock, { type: "left", payload: { refundChips: 0 } });
    }
  }
  // Need at least 2 funded seats to start
  const funded = room.seats.filter(
    (s): s is Seat => s !== null && s.chips > 0,
  );
  if (funded.length < 2) {
    // abort the start; back to lobby
    room.status = "lobby";
    broadcastLobby(room);
    // notify
    for (const sock of room.sockets.values()) {
      send(sock, {
        type: "error",
        payload: { message: "Not enough players bought in. Returning to lobby." },
      });
    }
    return;
  }
  // Build engine
  startGameNow(room);
}

function startGameNow(room: BaseRoom) {
  // seatMap from current seats
  room.seatMap = room.seats.map((s) => (s ? s.playerId : ""));
  if (room.config.gameType === "holdem") {
    room.game = { type: "holdem", state: buildHoldemState(room.seats, room.config) };
  } else {
    room.game = { type: "draw", state: buildDrawState(room.seats, room.config) };
  }
  room.status = "playing";
  // sync chips back from engine (in case ante/blinds reduced them already)
  syncSeatChipsFromEngine(room);
  broadcastGame(room);
  scheduleBotTick(room);
  maybeStartDepositWindow(room);
}

function syncSeatChipsFromEngine(room: BaseRoom) {
  if (!room.game) return;
  const engPlayers = room.game.state.players;
  for (let i = 0; i < engPlayers.length; i++) {
    const seatPid = room.seatMap[i];
    if (!seatPid) continue;
    const seat = room.seats.find((s) => s !== null && s.playerId === seatPid);
    if (seat) seat.chips = engPlayers[i].chips;
  }
}

// ---------- Between-hand deposit window ----------

function maybeStartDepositWindow(room: BaseRoom) {
  if (!room.game) return;
  const handOver =
    room.game.type === "holdem"
      ? isHoldemOver(room.game.state)
      : isHandOverDraw(room.game.state);
  if (!handOver) return;
  if (room.depositDeadline) return; // already open
  // If game is fully over (only 1 player left), don't open deposit window
  const isGameOver =
    room.game.type === "holdem"
      ? holdemGameOver(room.game.state)
      : gameOverDraw(room.game.state);
  if (isGameOver) return;
  room.depositDeadline = Date.now() + DEPOSIT_WINDOW_MS;
  room.depositsSubmitted.clear();
  setTimeout(() => {
    if (room.depositDeadline && Date.now() >= room.depositDeadline) {
      // deadline passed — broadcast so clients see it
      broadcastGame(room);
    }
  }, DEPOSIT_WINDOW_MS + 100);
}

function clearDepositWindow(room: BaseRoom) {
  room.depositDeadline = null;
  room.depositsSubmitted.clear();
}

// ---------- Bot / disconnected ticker ----------

function scheduleBotTick(room: BaseRoom) {
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  const game = room.game;
  if (!game) return;
  if (room.status !== "playing") return;
  const handOver =
    game.type === "holdem"
      ? isHoldemOver(game.state)
      : isHandOverDraw(game.state);
  if (handOver) return;

  const toActIdx = game.state.toActIdx;
  const seatPid = room.seatMap[toActIdx];
  const seat = room.seats.find((s) => s !== null && s.playerId === seatPid);
  if (!seat) return;
  const shouldAuto = seat.isBot || seat.disconnected;
  if (!shouldAuto) return;

  const delay = seat.disconnected ? 200 : 700 + Math.floor(Math.random() * 600);
  room.botTimer = setTimeout(() => {
    if (!room.game) return;
    const stillSeat = room.seats.find(
      (s) => s !== null && s.playerId === seatPid,
    );
    if (!stillSeat) return;
    if (game.type === "holdem") {
      if (stillSeat.disconnected) {
        applyAction(game.state, { type: "fold" });
      } else {
        const action = botDecide(game.state);
        applyAction(game.state, action);
      }
    } else {
      if (stillSeat.disconnected) {
        applyDrawAction(game.state, { type: "fold" });
      } else {
        // draw bots: pick action; if it's drawing stage, draw 0-3
        const ds = game.state;
        if (ds.stage === "drawing") {
          // draw a sensible number
          applyDrawAction(ds, { type: "draw", discardIdxs: [] });
        } else {
          const action = botDecideDraw(ds);
          applyDrawAction(ds, action);
        }
      }
    }
    syncSeatChipsFromEngine(room);
    maybeStartDepositWindow(room);
    broadcastGame(room);
    scheduleBotTick(room);
  }, delay);
}

// ---------- Hand transitions ----------

function dealNextHand(room: BaseRoom) {
  if (!room.game) return;
  // 1. Apply queued kicks and disconnects (free their seats)
  for (let i = 0; i < room.seats.length; i++) {
    const seat = room.seats[i];
    if (!seat) continue;
    const shouldFree = seat.pendingKick || seat.disconnected;
    if (shouldFree) {
      // refund chips? if disconnected: no socket → no refund. if kicked: send credit.
      if (seat.pendingKick && !seat.disconnected && !seat.isBot) {
        const sock = room.sockets.get(seat.playerId);
        if (sock) {
          send(sock, {
            type: "left",
            payload: { refundChips: seat.chips },
          });
        }
        room.sockets.delete(seat.playerId);
        PLAYER_TO_ROOM.delete(seat.playerId);
      } else if (seat.disconnected) {
        // chips forfeit
      }
      room.seats[i] = null;
      room.seatMap[i] = "";
    }
  }
  // 2. Activate any pending mid-game joiners (their seat is already set, with buyIn)
  for (let i = 0; i < room.seats.length; i++) {
    const seat = room.seats[i];
    if (!seat) continue;
    if (seat.joinedDuringGame) {
      seat.joinedDuringGame = false;
      seat.chips = seat.buyIn;
      room.seatMap[i] = seat.playerId;
    }
  }
  // 3. Check if game can continue (>=2 funded seats)
  const funded = room.seats.filter(
    (s): s is Seat => s !== null && s.chips > 0,
  );
  if (funded.length < 2) {
    // game over — close to lobby
    closeGameToLobby(room);
    return;
  }
  // 4. Update engine players from current seats (chips, names, status)
  const game = room.game;
  for (let i = 0; i < game.state.players.length; i++) {
    const seat = room.seats[i];
    if (seat) {
      game.state.players[i].name = seat.name;
      game.state.players[i].isHuman = !seat.isBot;
      game.state.players[i].chips = seat.chips;
      game.state.players[i].status = seat.chips > 0 ? "active" : "out";
    } else {
      game.state.players[i].name = "(empty)";
      game.state.players[i].isHuman = false;
      game.state.players[i].chips = 0;
      game.state.players[i].status = "out";
    }
  }
  // 5. Clear deposit window and start the next hand
  clearDepositWindow(room);
  if (game.type === "holdem") startHoldemHand(game.state);
  else startDrawHand(game.state);
  syncSeatChipsFromEngine(room);
  broadcastGame(room);
  scheduleBotTick(room);
  // If startHand immediately ended (e.g., last-player-standing), open deposit window
  maybeStartDepositWindow(room);
}

function closeGameToLobby(room: BaseRoom) {
  // Refund all active human players their chips
  for (const seat of room.seats) {
    if (!seat) continue;
    if (!seat.isBot && !seat.disconnected && seat.chips > 0) {
      sendTo(room, seat.playerId, {
        type: "left",
        payload: { refundChips: seat.chips },
      });
      room.sockets.delete(seat.playerId);
      PLAYER_TO_ROOM.delete(seat.playerId);
    }
  }
  if (room.botTimer) clearTimeout(room.botTimer);
  ROOMS.delete(room.code);
}

// ---------- Disconnect / leave ----------

function handleDisconnect(playerId: string) {
  const code = PLAYER_TO_ROOM.get(playerId);
  if (!code) return;
  const room = ROOMS.get(code);
  if (!room) {
    PLAYER_TO_ROOM.delete(playerId);
    return;
  }
  room.sockets.delete(playerId);
  if (room.status === "lobby") {
    // remove their seat outright
    const idx = room.seats.findIndex(
      (s) => s !== null && s.playerId === playerId,
    );
    if (idx >= 0) room.seats[idx] = null;
    PLAYER_TO_ROOM.delete(playerId);
    // host transfer
    if (room.hostId === playerId) {
      const newHost = room.seats.find(
        (s): s is Seat => s !== null && !s.isBot,
      );
      if (newHost) room.hostId = newHost.playerId;
      else {
        if (room.botTimer) clearTimeout(room.botTimer);
        if (room.buyInTimer) clearTimeout(room.buyInTimer);
        ROOMS.delete(room.code);
        return;
      }
    }
    if (room.sockets.size === 0) {
      if (room.botTimer) clearTimeout(room.botTimer);
      if (room.buyInTimer) clearTimeout(room.buyInTimer);
      ROOMS.delete(room.code);
      return;
    }
    broadcastLobby(room);
  } else {
    // playing — mark disconnected, keep seat through end of hand
    const idx = room.seats.findIndex(
      (s) => s !== null && s.playerId === playerId,
    );
    if (idx >= 0) {
      const seat = room.seats[idx];
      if (seat) {
        seat.disconnected = true;
        // host transfer if needed (host disconnected)
        if (room.hostId === playerId) {
          const newHost = room.seats.find(
            (s): s is Seat =>
              s !== null && !s.isBot && !s.disconnected && s.playerId !== playerId,
          );
          if (newHost) room.hostId = newHost.playerId;
        }
      }
    }
    PLAYER_TO_ROOM.delete(playerId);
    if (room.sockets.size === 0) {
      // everyone gone — kill room
      if (room.botTimer) clearTimeout(room.botTimer);
      if (room.buyInTimer) clearTimeout(room.buyInTimer);
      ROOMS.delete(room.code);
      return;
    }
    broadcastGame(room);
    scheduleBotTick(room);
  }
}

function leaveRoomByRequest(playerId: string, ws: WebSocket | null) {
  const code = PLAYER_TO_ROOM.get(playerId);
  if (!code) {
    if (ws) send(ws, { type: "left", payload: { refundChips: 0 } });
    return;
  }
  const room = ROOMS.get(code);
  PLAYER_TO_ROOM.delete(playerId);
  if (!room) {
    if (ws) send(ws, { type: "left", payload: { refundChips: 0 } });
    return;
  }
  // Compute refund chips (their current stack) for online play
  const idx = room.seats.findIndex(
    (s) => s !== null && s.playerId === playerId,
  );
  let refundChips = 0;
  if (idx >= 0 && room.seats[idx]) {
    refundChips = room.seats[idx]!.chips;
    room.seats[idx] = null;
    if (room.seatMap[idx] === playerId) room.seatMap[idx] = "";
  }
  room.sockets.delete(playerId);
  if (ws) send(ws, { type: "left", payload: { refundChips } });
  if (room.status === "lobby") {
    if (room.hostId === playerId) {
      const newHost = room.seats.find(
        (s): s is Seat => s !== null && !s.isBot,
      );
      if (newHost) room.hostId = newHost.playerId;
      else {
        if (room.botTimer) clearTimeout(room.botTimer);
        if (room.buyInTimer) clearTimeout(room.buyInTimer);
        ROOMS.delete(room.code);
        return;
      }
    }
    if (room.sockets.size === 0) {
      if (room.botTimer) clearTimeout(room.botTimer);
      if (room.buyInTimer) clearTimeout(room.buyInTimer);
      ROOMS.delete(room.code);
      return;
    }
    broadcastLobby(room);
  } else {
    // playing — if their slot was active, mark engine player out
    if (idx >= 0 && room.game && room.game.state.players[idx]) {
      room.game.state.players[idx].chips = 0;
      room.game.state.players[idx].status = "folded";
      // if it was their turn or they were active in the hand, the hand may need progressing
    }
    if (room.hostId === playerId) {
      const newHost = room.seats.find(
        (s): s is Seat => s !== null && !s.isBot && !s.disconnected,
      );
      if (newHost) room.hostId = newHost.playerId;
    }
    if (room.sockets.size === 0) {
      if (room.botTimer) clearTimeout(room.botTimer);
      ROOMS.delete(room.code);
      return;
    }
    broadcastGame(room);
    scheduleBotTick(room);
  }
}

// ---------- Public rooms ----------

function listPublicRooms(): PublicRoomInfo[] {
  const out: PublicRoomInfo[] = [];
  for (const room of ROOMS.values()) {
    if (!room.config.isPublic) continue;
    const playerCount = room.seats.filter(
      (s) => s !== null && !s.isBot,
    ).length;
    const hasOpenSeat = room.seats.some((s) => s === null);
    if (room.status === "playing" && !hasOpenSeat) continue; // no point listing
    out.push({
      code: room.code,
      gameType: room.config.gameType,
      smallBlind: room.config.smallBlind,
      bigBlind: room.config.bigBlind,
      ante: room.config.ante,
      playerCount,
      maxPlayers: room.config.maxPlayers,
      status: room.status,
      handNumber: getCurrentHandNumber(room),
    });
  }
  return out;
}

// ---------- Connection entry ----------

export function handleConnection(ws: WebSocket) {
  const playerId = randomUUID();
  send(ws, { type: "welcome", payload: { playerId } });

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      sendError(ws, "Invalid message");
      return;
    }
    handleMessage(playerId, ws, msg);
  });

  ws.on("close", () => {
    handleDisconnect(playerId);
  });
}

function handleMessage(playerId: string, ws: WebSocket, msg: ClientMsg) {
  switch (msg.type) {
    case "create":
      return handleCreate(playerId, ws, msg.payload);
    case "join":
      return handleJoin(playerId, ws, msg.payload);
    case "leave":
      return leaveRoomByRequest(playerId, ws);
    case "start":
      return handleStart(playerId, ws);
    case "buyIn":
      return handleBuyIn(playerId, ws, msg.payload.amount);
    case "deposit":
      return handleDeposit(playerId, ws, msg.payload.amount);
    case "kick":
      return handleKick(playerId, ws, msg.payload.seatId);
    case "listPublic":
      send(ws, { type: "publicRooms", payload: listPublicRooms() });
      return;
    case "action":
      return handleAction(playerId, ws, msg.payload);
    case "nextHand":
      return handleNextHand(playerId, ws);
  }
}

function handleCreate(
  playerId: string,
  ws: WebSocket,
  payload: { name: string; config: RoomConfig },
) {
  if (PLAYER_TO_ROOM.has(playerId)) {
    sendError(ws, "Already in a room");
    return;
  }
  const cfg = payload.config;
  const name = (payload.name || "").trim().slice(0, 24) || "Player";
  const max = Math.max(2, Math.min(8, cfg.maxPlayers || 4));
  const code = genCode();
  const seats: (Seat | null)[] = Array(max).fill(null);
  seats[0] = {
    playerId,
    name,
    isBot: false,
    chips: 0,
    buyIn: 0,
    disconnected: false,
    pendingKick: false,
    joinedDuringGame: false,
  };
  const room: BaseRoom = {
    code,
    hostId: playerId,
    config: {
      ...cfg,
      maxPlayers: max,
      startingChips: cfg.startingChips || 1000,
      smallBlind: cfg.smallBlind || 10,
      bigBlind: cfg.bigBlind || 20,
      ante: cfg.ante ?? 0,
      isPublic: !!cfg.isPublic,
      gameType: cfg.gameType,
    },
    seats,
    status: "lobby",
    game: null,
    seatMap: [],
    sockets: new Map([[playerId, ws]]),
    botTimer: null,
    buyInDeadline: null,
    buyInsSubmitted: new Map(),
    buyInTimer: null,
    depositDeadline: null,
    depositsSubmitted: new Set(),
  };
  ROOMS.set(code, room);
  PLAYER_TO_ROOM.set(playerId, code);
  send(ws, { type: "lobby", payload: buildLobbyState(room, playerId) });
}

function handleJoin(
  playerId: string,
  ws: WebSocket,
  payload: { code: string; name: string },
) {
  if (PLAYER_TO_ROOM.has(playerId)) {
    sendError(ws, "Already in a room");
    return;
  }
  const code = payload.code.toUpperCase().trim();
  const room = ROOMS.get(code);
  if (!room) {
    sendError(ws, "Room not found");
    return;
  }
  const emptyIdx = room.seats.findIndex((s) => s === null);
  if (emptyIdx < 0) {
    sendError(ws, "Room is full");
    return;
  }
  const name = (payload.name || "").trim().slice(0, 24) || "Player";
  const newSeat: Seat = {
    playerId,
    name,
    isBot: false,
    chips: 0,
    buyIn: 0,
    disconnected: false,
    pendingKick: false,
    joinedDuringGame: room.status === "playing",
  };
  room.seats[emptyIdx] = newSeat;
  room.sockets.set(playerId, ws);
  PLAYER_TO_ROOM.set(playerId, code);
  if (room.status === "lobby") {
    broadcastLobby(room);
  } else {
    // mid-game join: send them a lobby state too (showing buyIn=null) and the current game view
    send(ws, { type: "lobby", payload: buildLobbyState(room, playerId) });
    broadcastGame(room);
  }
}

function handleStart(playerId: string, ws: WebSocket) {
  const code = PLAYER_TO_ROOM.get(playerId);
  const room = code ? ROOMS.get(code) : undefined;
  if (!room) return sendError(ws, "Not in a room");
  if (room.hostId !== playerId)
    return sendError(ws, "Only the host can start");
  if (room.status !== "lobby") return;
  if (room.buyInDeadline != null) return; // already in buy-in window
  const humansSeated = room.seats.filter(
    (s): s is Seat => s !== null && !s.isBot,
  ).length;
  if (humansSeated < 1)
    return sendError(ws, "Need at least 1 human player");
  startBuyInWindow(room);
}

function handleBuyIn(playerId: string, ws: WebSocket, amount: number) {
  const code = PLAYER_TO_ROOM.get(playerId);
  const room = code ? ROOMS.get(code) : undefined;
  if (!room) return sendError(ws, "Not in a room");
  const seat = room.seats.find(
    (s): s is Seat => s !== null && s.playerId === playerId,
  );
  if (!seat) return sendError(ws, "No seat");
  const amt = Math.max(0, Math.floor(amount || 0));
  if (amt < room.config.bigBlind) {
    return sendError(
      ws,
      `Buy-in must be at least ${room.config.bigBlind} (one big blind)`,
    );
  }
  if (room.status === "lobby" && room.buyInDeadline != null) {
    // Lobby buy-in window
    room.buyInsSubmitted.set(playerId, amt);
    broadcastLobby(room);
    // If all humans submitted, finish early
    const humans = room.seats.filter(
      (s): s is Seat => s !== null && !s.isBot,
    );
    const allSubmitted = humans.every((s) =>
      room.buyInsSubmitted.has(s.playerId),
    );
    if (allSubmitted) finishBuyInWindow(room);
    return;
  }
  if (room.status === "playing" && seat.joinedDuringGame) {
    // Mid-game joiner buy-in
    seat.buyIn = amt;
    // They'll be seated at next hand start
    broadcastGame(room);
    return;
  }
  return sendError(ws, "No buy-in needed right now");
}

function handleDeposit(playerId: string, ws: WebSocket, amount: number) {
  const code = PLAYER_TO_ROOM.get(playerId);
  const room = code ? ROOMS.get(code) : undefined;
  if (!room || !room.game) return sendError(ws, "Not in a game");
  if (!room.depositDeadline) return sendError(ws, "Not in deposit window");
  if (Date.now() >= room.depositDeadline)
    return sendError(ws, "Deposit window closed");
  if (room.depositsSubmitted.has(playerId))
    return sendError(ws, "Already deposited this round");
  const seatIdx = room.seats.findIndex(
    (s) => s !== null && s.playerId === playerId,
  );
  if (seatIdx < 0) return;
  const seat = room.seats[seatIdx]!;
  const have = seat.chips;
  const amt = Math.max(0, Math.min(have, Math.floor(amount || 0)));
  if (amt <= 0) {
    room.depositsSubmitted.add(playerId); // record the "skip"
    broadcastGame(room);
    return;
  }
  seat.chips = have - amt;
  if (room.game.state.players[seatIdx])
    room.game.state.players[seatIdx].chips = seat.chips;
  room.depositsSubmitted.add(playerId);
  send(ws, {
    type: "bankCredit",
    payload: { amount: amt, reason: "deposit" },
  });
  broadcastGame(room);
}

function handleKick(playerId: string, ws: WebSocket, targetId: string) {
  const code = PLAYER_TO_ROOM.get(playerId);
  const room = code ? ROOMS.get(code) : undefined;
  if (!room) return sendError(ws, "Not in a room");
  if (room.hostId !== playerId)
    return sendError(ws, "Only the host can kick");
  if (targetId === room.hostId)
    return sendError(ws, "Host cannot kick themselves");
  const idx = room.seats.findIndex(
    (s) => s !== null && s.playerId === targetId,
  );
  if (idx < 0) return;
  const seat = room.seats[idx]!;
  if (room.status === "lobby") {
    // immediate
    if (!seat.isBot) {
      const sock = room.sockets.get(targetId);
      if (sock) send(sock, { type: "left", payload: { refundChips: 0 } });
      room.sockets.delete(targetId);
      PLAYER_TO_ROOM.delete(targetId);
    }
    room.seats[idx] = null;
    broadcastLobby(room);
  } else {
    // queue for end of hand
    seat.pendingKick = true;
    broadcastGame(room);
  }
}

function handleAction(
  playerId: string,
  ws: WebSocket,
  a:
    | { kind: "fold" }
    | { kind: "check" }
    | { kind: "call" }
    | { kind: "bet"; amount: number }
    | { kind: "raise"; toAmount: number }
    | { kind: "draw"; discardIdxs: number[] },
) {
  const code = PLAYER_TO_ROOM.get(playerId);
  const room = code ? ROOMS.get(code) : undefined;
  if (!room || !room.game) return sendError(ws, "Not in a game");
  const toActIdx = room.game.state.toActIdx;
  const expectedPid = room.seatMap[toActIdx];
  if (expectedPid !== playerId) return sendError(ws, "Not your turn");
  if (room.game.type === "holdem") {
    if (a.kind === "fold") applyAction(room.game.state, { type: "fold" });
    else if (a.kind === "check")
      applyAction(room.game.state, { type: "check" });
    else if (a.kind === "call")
      applyAction(room.game.state, { type: "call" });
    else if (a.kind === "bet")
      applyAction(room.game.state, { type: "bet", amount: a.amount });
    else if (a.kind === "raise")
      applyAction(room.game.state, { type: "raise", toAmount: a.toAmount });
    else return sendError(ws, "Invalid action for hold'em");
  } else {
    if (a.kind === "fold")
      applyDrawAction(room.game.state, { type: "fold" });
    else if (a.kind === "check")
      applyDrawAction(room.game.state, { type: "check" });
    else if (a.kind === "call")
      applyDrawAction(room.game.state, { type: "call" });
    else if (a.kind === "bet")
      applyDrawAction(room.game.state, { type: "bet", amount: a.amount });
    else if (a.kind === "raise")
      applyDrawAction(room.game.state, {
        type: "raise",
        toAmount: a.toAmount,
      });
    else if (a.kind === "draw")
      applyDrawAction(room.game.state, {
        type: "draw",
        discardIdxs: a.discardIdxs,
      });
    else return sendError(ws, "Invalid action");
  }
  syncSeatChipsFromEngine(room);
  maybeStartDepositWindow(room);
  broadcastGame(room);
  scheduleBotTick(room);
}

function handleNextHand(playerId: string, ws: WebSocket) {
  const code = PLAYER_TO_ROOM.get(playerId);
  const room = code ? ROOMS.get(code) : undefined;
  if (!room || !room.game) return;
  if (room.hostId !== playerId)
    return sendError(ws, "Only host can deal next hand");
  // enforce deposit window
  if (room.depositDeadline && Date.now() < room.depositDeadline) {
    const remaining = Math.ceil((room.depositDeadline - Date.now()) / 1000);
    return sendError(
      ws,
      `Deposit window closes in ${remaining}s`,
    );
  }
  const isOver =
    room.game.type === "holdem"
      ? holdemGameOver(room.game.state)
      : gameOverDraw(room.game.state);
  if (isOver) return sendError(ws, "Game is over");
  dealNextHand(room);
}
