import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  type HoldemState,
  applyAction,
  botDecide,
  createHoldemState,
  isHandOver as isHoldemOver,
  legalActions as holdemLegal,
  startHand as startHoldemHand,
  gameOver as holdemGameOver,
} from "../poker/holdem";
import {
  type DrawState,
  applyDrawAction,
  botDecideDraw,
  createDrawState,
  isHandOverDraw,
  legalDrawActions,
  startDrawHand,
  gameOverDraw,
} from "../poker/draw";
import type {
  ClientMsg,
  GameView,
  LobbyPlayer,
  LobbyState,
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

export interface Seat {
  playerId: string;
  name: string;
  isBot: boolean;
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
  // for "playing" we map engine player index → seat
  seatMap: string[]; // playerId per engine index, set when game starts
  sockets: Map<string, WebSocket>; // human playerId → socket
  botTimer: NodeJS.Timeout | null;
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

function buildLobbyState(room: BaseRoom, viewerId: string): LobbyState {
  const players: LobbyPlayer[] = [];
  for (const seat of room.seats) {
    if (!seat) continue;
    players.push({
      id: seat.playerId,
      name: seat.name,
      isHost: seat.playerId === room.hostId,
      isYou: seat.playerId === viewerId,
      isBot: seat.isBot,
    });
  }
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    config: room.config,
    players,
    yourId: viewerId,
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

  if (game.type === "holdem") {
    const state = game.state;
    const showAll = isHoldemOver(state);
    for (let i = 0; i < state.players.length; i++) {
      const sp = state.players[i];
      const seatPid = room.seatMap[i];
      const showHole =
        seatPid === viewerId ||
        (showAll && sp.status !== "folded" && sp.status !== "out");
      players.push({
        id: seatPid,
        name: sp.name,
        isBot: !room.sockets.has(seatPid),
        chips: sp.chips,
        bet: sp.bet,
        status: sp.status,
        hole: sp.hole.length > 0 ? (showHole ? sp.hole : null) : [],
      });
    }
    const toActPid = room.seatMap[state.toActIdx] ?? null;
    const dealerPid = room.seatMap[state.dealerIdx] ?? null;
    const isYourTurn = toActPid === viewerId;
    return {
      gameType: "holdem",
      stage: state.stage,
      yourId: viewerId,
      toActId: toActPid,
      dealerId: dealerPid,
      players,
      community: state.community,
      pot: state.pot,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      log: state.log,
      handNumber: state.handNumber,
      lastWinners: state.lastWinners.map((w) => ({
        id: room.seatMap[w.id],
        name: w.name,
        amount: w.amount,
        reason: w.reason,
      })),
      isHandOver: isHoldemOver(state),
      isGameOver: holdemGameOver(state),
      legal: isYourTurn ? holdemLegal(state) : null,
      canDrawNow: false,
      config: room.config,
    };
  }

  // draw
  const state = game.state;
  const showAll = isHandOverDraw(state);
  for (let i = 0; i < state.players.length; i++) {
    const sp = state.players[i];
    const seatPid = room.seatMap[i];
    const showHand =
      seatPid === viewerId ||
      (showAll && sp.status !== "folded" && sp.status !== "out");
    players.push({
      id: seatPid,
      name: sp.name,
      isBot: !room.sockets.has(seatPid),
      chips: sp.chips,
      bet: sp.bet,
      status: sp.status,
      hand: sp.hand.length > 0 ? (showHand ? sp.hand : null) : [],
      hasDrawn: sp.hasDrawn,
      drawnCount: sp.drawnCount,
    });
  }
  const toActPid = room.seatMap[state.toActIdx] ?? null;
  const dealerPid = room.seatMap[state.dealerIdx] ?? null;
  const isYourTurn = toActPid === viewerId;
  let legal: GameView["legal"] = null;
  let canDrawNow = false;
  if (isYourTurn) {
    if (state.stage === "drawing") canDrawNow = true;
    else if (state.stage === "predraw" || state.stage === "postdraw")
      legal = legalDrawActions(state);
  }
  return {
    gameType: "draw",
    stage: state.stage,
    yourId: viewerId,
    toActId: toActPid,
    dealerId: dealerPid,
    players,
    pot: state.pot,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    log: state.log,
    handNumber: state.handNumber,
    lastWinners: state.lastWinners.map((w) => ({
      id: room.seatMap[w.id],
      name: w.name,
      amount: w.amount,
      reason: w.reason,
    })),
    isHandOver: isHandOverDraw(state),
    isGameOver: gameOverDraw(state),
    legal,
    canDrawNow,
    config: room.config,
  };
}

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
  const isBotTurn = !room.sockets.has(seatPid);
  if (!isBotTurn) return;

  room.botTimer = setTimeout(() => {
    if (!room.game) return;
    if (room.game.type === "holdem") {
      const action = botDecide(room.game.state);
      applyAction(room.game.state, action);
    } else {
      const action = botDecideDraw(room.game.state);
      applyDrawAction(room.game.state, action);
    }
    broadcastGame(room);
    scheduleBotTick(room);
  }, 700 + Math.floor(Math.random() * 600));
}

function startGame(room: BaseRoom) {
  // Fill seats with bots if option set
  if (room.config.fillBots) {
    let botIdx = 0;
    for (let i = 0; i < room.seats.length; i++) {
      if (!room.seats[i]) {
        const name = BOT_NAMES[botIdx % BOT_NAMES.length];
        botIdx++;
        room.seats[i] = {
          playerId: `bot:${room.code}:${i}`,
          name,
          isBot: true,
        };
      }
    }
  }
  // Compact seats (game engine wants a contiguous players array)
  const filled = room.seats.filter((s): s is Seat => s !== null);
  if (filled.length < 2) {
    return false;
  }
  room.seatMap = filled.map((s) => s.playerId);
  const playersCfg = filled.map((s) => ({
    name: s.name,
    isHuman: !s.isBot,
  }));
  if (room.config.gameType === "holdem") {
    const state = createHoldemState({
      players: playersCfg,
      startingChips: room.config.startingChips,
      smallBlind: room.config.smallBlind,
      bigBlind: room.config.bigBlind,
    });
    room.game = { type: "holdem", state };
  } else {
    const state = createDrawState({
      players: playersCfg,
      startingChips: room.config.startingChips,
      ante: room.config.ante,
      smallBlind: room.config.smallBlind,
      bigBlind: room.config.bigBlind,
    });
    room.game = { type: "draw", state };
  }
  room.status = "playing";
  broadcastGame(room);
  scheduleBotTick(room);
  return true;
}

function leaveRoom(playerId: string, ws: WebSocket | null) {
  const code = PLAYER_TO_ROOM.get(playerId);
  if (!code) return;
  const room = ROOMS.get(code);
  PLAYER_TO_ROOM.delete(playerId);
  if (!room) return;
  room.sockets.delete(playerId);
  if (ws) send(ws, { type: "left" });

  if (room.status === "lobby") {
    // remove their seat
    const idx = room.seats.findIndex(
      (s) => s !== null && s.playerId === playerId,
    );
    if (idx >= 0) room.seats[idx] = null;
    // if host left, transfer or close
    if (room.hostId === playerId) {
      const newHost = room.seats.find(
        (s) => s !== null && !s.isBot && s.playerId !== playerId,
      );
      if (newHost) {
        room.hostId = newHost.playerId;
      } else {
        if (room.botTimer) clearTimeout(room.botTimer);
        ROOMS.delete(room.code);
        return;
      }
    }
    // if no humans left, close
    const hasHuman = room.seats.some((s) => s !== null && !s.isBot);
    if (!hasHuman) {
      if (room.botTimer) clearTimeout(room.botTimer);
      ROOMS.delete(room.code);
      return;
    }
    broadcastLobby(room);
  } else {
    // playing — convert their seat to bot so the game continues
    const idx = room.seatMap.findIndex((p) => p === playerId);
    if (idx >= 0) {
      const seatIdx = room.seats.findIndex(
        (s) => s !== null && s.playerId === playerId,
      );
      if (seatIdx >= 0 && room.seats[seatIdx]) {
        room.seats[seatIdx]!.isBot = true;
        room.seats[seatIdx]!.name = `${room.seats[seatIdx]!.name}*`;
      }
    }
    // if no humans left, just close the room
    const hasHumanSocket = room.sockets.size > 0;
    if (!hasHumanSocket) {
      if (room.botTimer) clearTimeout(room.botTimer);
      ROOMS.delete(room.code);
      return;
    }
    broadcastGame(room);
    scheduleBotTick(room);
  }
}

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
    leaveRoom(playerId, null);
  });
}

function handleMessage(playerId: string, ws: WebSocket, msg: ClientMsg) {
  switch (msg.type) {
    case "create": {
      if (PLAYER_TO_ROOM.has(playerId)) {
        sendError(ws, "Already in a room");
        return;
      }
      const cfg = msg.payload.config;
      const name = (msg.payload.name || "").trim().slice(0, 24) || "Player";
      const max = Math.max(2, Math.min(8, cfg.maxPlayers || 4));
      const code = genCode();
      const seats: (Seat | null)[] = Array(max).fill(null);
      seats[0] = { playerId, name, isBot: false };
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
          fillBots: !!cfg.fillBots,
          gameType: cfg.gameType,
        },
        seats,
        status: "lobby",
        game: null,
        seatMap: [],
        sockets: new Map([[playerId, ws]]),
        botTimer: null,
      };
      ROOMS.set(code, room);
      PLAYER_TO_ROOM.set(playerId, code);
      send(ws, { type: "lobby", payload: buildLobbyState(room, playerId) });
      return;
    }
    case "join": {
      if (PLAYER_TO_ROOM.has(playerId)) {
        sendError(ws, "Already in a room");
        return;
      }
      const code = msg.payload.code.toUpperCase().trim();
      const room = ROOMS.get(code);
      if (!room) {
        sendError(ws, "Room not found");
        return;
      }
      if (room.status !== "lobby") {
        sendError(ws, "Game already in progress");
        return;
      }
      const emptyIdx = room.seats.findIndex((s) => s === null);
      if (emptyIdx < 0) {
        sendError(ws, "Room is full");
        return;
      }
      const name =
        (msg.payload.name || "").trim().slice(0, 24) || "Player";
      room.seats[emptyIdx] = { playerId, name, isBot: false };
      room.sockets.set(playerId, ws);
      PLAYER_TO_ROOM.set(playerId, code);
      broadcastLobby(room);
      return;
    }
    case "leave": {
      leaveRoom(playerId, ws);
      return;
    }
    case "start": {
      const code = PLAYER_TO_ROOM.get(playerId);
      const room = code ? ROOMS.get(code) : undefined;
      if (!room) return sendError(ws, "Not in a room");
      if (room.hostId !== playerId)
        return sendError(ws, "Only the host can start");
      if (room.status !== "lobby") return;
      const filled = room.seats.filter((s) => s !== null).length;
      const willHaveBots = room.config.fillBots;
      const total = willHaveBots ? room.seats.length : filled;
      if (total < 2)
        return sendError(
          ws,
          "Need at least 2 players (or enable fill-with-bots)",
        );
      const ok = startGame(room);
      if (!ok) sendError(ws, "Could not start game");
      return;
    }
    case "addBot": {
      const code = PLAYER_TO_ROOM.get(playerId);
      const room = code ? ROOMS.get(code) : undefined;
      if (!room) return sendError(ws, "Not in a room");
      if (room.hostId !== playerId)
        return sendError(ws, "Only the host can add bots");
      if (room.status !== "lobby") return;
      const emptyIdx = room.seats.findIndex((s) => s === null);
      if (emptyIdx < 0) return sendError(ws, "Room is full");
      const usedNames = new Set(
        room.seats.filter((s): s is Seat => !!s).map((s) => s.name),
      );
      const name =
        BOT_NAMES.find((n) => !usedNames.has(n)) ?? `Bot${emptyIdx}`;
      room.seats[emptyIdx] = {
        playerId: `bot:${room.code}:${emptyIdx}:${Date.now()}`,
        name,
        isBot: true,
      };
      broadcastLobby(room);
      return;
    }
    case "removeSeat": {
      const code = PLAYER_TO_ROOM.get(playerId);
      const room = code ? ROOMS.get(code) : undefined;
      if (!room) return sendError(ws, "Not in a room");
      if (room.hostId !== playerId)
        return sendError(ws, "Only the host can remove players");
      if (room.status !== "lobby") return;
      const targetId = msg.payload.seatId;
      if (targetId === room.hostId)
        return sendError(ws, "Host cannot remove themselves");
      const idx = room.seats.findIndex(
        (s) => s !== null && s.playerId === targetId,
      );
      if (idx < 0) return;
      const seat = room.seats[idx];
      room.seats[idx] = null;
      if (seat && !seat.isBot) {
        const sock = room.sockets.get(seat.playerId);
        room.sockets.delete(seat.playerId);
        PLAYER_TO_ROOM.delete(seat.playerId);
        if (sock) send(sock, { type: "left" });
      }
      broadcastLobby(room);
      return;
    }
    case "action": {
      const code = PLAYER_TO_ROOM.get(playerId);
      const room = code ? ROOMS.get(code) : undefined;
      if (!room || !room.game) return sendError(ws, "Not in a game");
      const toActIdx = (room.game.state as { toActIdx: number }).toActIdx;
      const expectedPid = room.seatMap[toActIdx];
      if (expectedPid !== playerId)
        return sendError(ws, "Not your turn");
      const a = msg.payload;
      if (room.game.type === "holdem") {
        if (a.kind === "fold") applyAction(room.game.state, { type: "fold" });
        else if (a.kind === "check")
          applyAction(room.game.state, { type: "check" });
        else if (a.kind === "call")
          applyAction(room.game.state, { type: "call" });
        else if (a.kind === "bet")
          applyAction(room.game.state, { type: "bet", amount: a.amount });
        else if (a.kind === "raise")
          applyAction(room.game.state, {
            type: "raise",
            toAmount: a.toAmount,
          });
        else return sendError(ws, "Invalid action for hold'em");
      } else {
        if (a.kind === "fold")
          applyDrawAction(room.game.state, { type: "fold" });
        else if (a.kind === "check")
          applyDrawAction(room.game.state, { type: "check" });
        else if (a.kind === "call")
          applyDrawAction(room.game.state, { type: "call" });
        else if (a.kind === "bet")
          applyDrawAction(room.game.state, {
            type: "bet",
            amount: a.amount,
          });
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
      broadcastGame(room);
      scheduleBotTick(room);
      return;
    }
    case "nextHand": {
      const code = PLAYER_TO_ROOM.get(playerId);
      const room = code ? ROOMS.get(code) : undefined;
      if (!room || !room.game) return;
      if (room.hostId !== playerId)
        return sendError(ws, "Only host can deal next hand");
      if (room.game.type === "holdem") {
        if (holdemGameOver(room.game.state))
          return sendError(ws, "Game is over");
        startHoldemHand(room.game.state);
      } else {
        if (gameOverDraw(room.game.state))
          return sendError(ws, "Game is over");
        startDrawHand(room.game.state);
      }
      broadcastGame(room);
      scheduleBotTick(room);
      return;
    }
  }
}
