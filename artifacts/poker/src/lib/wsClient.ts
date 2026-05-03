import { useEffect, useState } from "react";
import type {
  ClientMsg,
  GameView,
  LobbyState,
  PublicRoomInfo,
  ServerMsg,
} from "./protocol";
import { depositToBank } from "./bank";

type Status = "connecting" | "open" | "closed" | "error";

interface PokerStore {
  status: Status;
  playerId: string | null;
  lobby: LobbyState | null;
  game: GameView | null;
  publicRooms: PublicRoomInfo[];
  error: string | null;
  send: (msg: ClientMsg) => void;
  reconnect: () => void;
  clearError: () => void;
}

let socket: WebSocket | null = null;
const listeners = new Set<(s: PokerStore) => void>();
let state: Omit<PokerStore, "send" | "reconnect" | "clearError"> = {
  status: "closed",
  playerId: null,
  lobby: null,
  game: null,
  publicRooms: [],
  error: null,
};

function emit() {
  const snap = makeStore();
  listeners.forEach((l) => l(snap));
}

function makeStore(): PokerStore {
  return {
    ...state,
    send,
    reconnect: connect,
    clearError: () => {
      state = { ...state, error: null };
      emit();
    },
  };
}

function getWsUrl(): string {
  const base = (import.meta as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ?? "";
  if (base) {
    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/ws";
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

function connect() {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  state = { ...state, status: "connecting", error: null };
  emit();
  try {
    socket = new WebSocket(getWsUrl());
  } catch (e) {
    state = {
      ...state,
      status: "error",
      error: String((e as Error).message ?? e),
    };
    emit();
    return;
  }
  socket.onopen = () => {
    state = { ...state, status: "open" };
    emit();
  };
  socket.onclose = () => {
    state = {
      ...state,
      status: "closed",
      playerId: null,
      lobby: null,
      game: null,
    };
    emit();
  };
  socket.onerror = () => {
    state = { ...state, status: "error", error: "Connection error" };
    emit();
  };
  socket.onmessage = (ev) => {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleServerMsg(msg);
  };
}

function handleServerMsg(msg: ServerMsg) {
  switch (msg.type) {
    case "welcome":
      state = { ...state, playerId: msg.payload.playerId };
      break;
    case "lobby":
      state = { ...state, lobby: msg.payload };
      break;
    case "game":
      state = { ...state, game: msg.payload };
      break;
    case "left":
      if (msg.payload.refundChips > 0) {
        depositToBank(msg.payload.refundChips);
      }
      state = { ...state, lobby: null, game: null };
      break;
    case "bankCredit":
      if (msg.payload.amount > 0) {
        depositToBank(msg.payload.amount);
      }
      break;
    case "publicRooms":
      state = { ...state, publicRooms: msg.payload };
      break;
    case "error":
      state = { ...state, error: msg.payload.message };
      break;
  }
  emit();
}

function send(msg: ClientMsg) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    state = { ...state, error: "Not connected" };
    emit();
    return;
  }
  socket.send(JSON.stringify(msg));
}

export function disconnect() {
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function usePokerSocket(): PokerStore {
  const [snap, setSnap] = useState<PokerStore>(() => makeStore());
  useEffect(() => {
    const fn = (s: PokerStore) => setSnap(s);
    listeners.add(fn);
    if (
      !socket ||
      (socket.readyState !== WebSocket.OPEN &&
        socket.readyState !== WebSocket.CONNECTING)
    ) {
      connect();
    } else {
      setSnap(makeStore());
    }
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return snap;
}
