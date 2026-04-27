import {
  Card,
  bestHandFromN,
  cardLabel,
  compareScore,
  handCategoryName,
  makeDeck,
  shuffle,
} from "./cards";

export type DrawStage =
  | "predraw"
  | "drawing"
  | "postdraw"
  | "showdown"
  | "handover";

export interface DrawPlayer {
  id: number;
  name: string;
  isHuman: boolean;
  chips: number;
  hand: Card[];
  bet: number;
  totalBet: number;
  status: "active" | "folded" | "allin" | "out";
  hasActed: boolean;
  hasDrawn: boolean;
  drawnCount: number;
}

export interface DrawConfig {
  players: { name: string; isHuman: boolean }[];
  startingChips: number;
  ante: number;
  smallBlind: number;
  bigBlind: number;
}

export interface DrawState {
  config: DrawConfig;
  players: DrawPlayer[];
  dealerIdx: number;
  toActIdx: number;
  stage: DrawStage;
  deck: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  log: string[];
  handNumber: number;
  lastWinners: { id: number; name: string; amount: number; reason: string }[];
}

function log(state: DrawState, msg: string): void {
  state.log.push(msg);
  if (state.log.length > 200) state.log.shift();
}

function postBet(state: DrawState, idx: number, amount: number): void {
  const p = state.players[idx];
  const actual = Math.min(amount, p.chips);
  p.chips -= actual;
  p.bet += actual;
  p.totalBet += actual;
  state.pot += actual;
  if (p.chips === 0) p.status = "allin";
}

function nextNonOut(players: DrawPlayer[], startIdx: number): number {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (startIdx + i) % n;
    if (players[idx].status !== "out") return idx;
  }
  return startIdx;
}

function notFoldedCount(players: DrawPlayer[]): number {
  return players.filter(
    (p) => p.status === "active" || p.status === "allin",
  ).length;
}

function activeCount(players: DrawPlayer[]): number {
  return players.filter((p) => p.status === "active").length;
}

export function createDrawState(config: DrawConfig): DrawState {
  const players: DrawPlayer[] = config.players.map((p, i) => ({
    id: i,
    name: p.name,
    isHuman: p.isHuman,
    chips: config.startingChips,
    hand: [],
    bet: 0,
    totalBet: 0,
    status: "active",
    hasActed: false,
    hasDrawn: false,
    drawnCount: 0,
  }));
  const state: DrawState = {
    config,
    players,
    dealerIdx: 0,
    toActIdx: 0,
    stage: "predraw",
    deck: [],
    pot: 0,
    currentBet: 0,
    minRaise: config.bigBlind,
    log: [],
    handNumber: 0,
    lastWinners: [],
  };
  startDrawHand(state);
  return state;
}

export function startDrawHand(state: DrawState): void {
  for (const p of state.players) {
    p.hand = [];
    p.bet = 0;
    p.totalBet = 0;
    p.hasActed = false;
    p.hasDrawn = false;
    p.drawnCount = 0;
    if (p.chips <= 0) p.status = "out";
    else p.status = "active";
  }
  state.deck = shuffle(makeDeck());
  state.pot = 0;
  state.currentBet = 0;
  state.minRaise = state.config.bigBlind;
  state.stage = "predraw";
  state.handNumber += 1;
  state.lastWinners = [];

  if (state.handNumber > 1)
    state.dealerIdx = nextNonOut(state.players, state.dealerIdx);
  else if (state.players[state.dealerIdx].status === "out")
    state.dealerIdx = nextNonOut(state.players, state.dealerIdx);

  // antes
  if (state.config.ante > 0) {
    for (let i = 0; i < state.players.length; i++) {
      if (state.players[i].status !== "out") {
        postBet(state, i, state.config.ante);
        state.players[i].bet = 0; // antes go to pot but don't count as round bet
      }
    }
  }

  const sbIdx = nextNonOut(state.players, state.dealerIdx);
  const bbIdx = nextNonOut(state.players, sbIdx);
  postBet(state, sbIdx, state.config.smallBlind);
  postBet(state, bbIdx, state.config.bigBlind);
  state.currentBet = state.config.bigBlind;

  // deal 5 cards each
  for (let r = 0; r < 5; r++) {
    let idx = sbIdx;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[idx];
      if (p.status !== "out") p.hand.push(state.deck.pop()!);
      idx = (idx + 1) % state.players.length;
    }
  }

  state.toActIdx = nextNonOut(state.players, bbIdx);
  log(
    state,
    `--- Hand #${state.handNumber} --- ${state.config.ante > 0 ? `Ante: ${state.config.ante}, ` : ""}Blinds: ${state.config.smallBlind}/${state.config.bigBlind}`,
  );

  const remaining = state.players.filter((p) => p.status !== "out");
  if (remaining.length === 1) {
    awardPot(state, [remaining[0].id], "last player standing");
    state.stage = "handover";
  }
}

export type DrawAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "bet"; amount: number }
  | { type: "raise"; toAmount: number }
  | { type: "draw"; discardIdxs: number[] };

export function legalDrawActions(state: DrawState) {
  const p = state.players[state.toActIdx];
  const callAmount = state.currentBet - p.bet;
  return {
    canCheck: callAmount === 0,
    canCall: callAmount > 0 && p.chips > 0,
    callAmount: Math.min(callAmount, p.chips),
    canRaise: p.chips > callAmount,
    minRaiseTo: state.currentBet + state.minRaise,
    maxRaiseTo: p.bet + p.chips,
  };
}

export function applyDrawAction(state: DrawState, action: DrawAction): void {
  if (state.stage === "drawing") {
    if (action.type !== "draw") return;
    const p = state.players[state.toActIdx];
    if (p.status !== "active") {
      advanceDrawerOrFinish(state);
      return;
    }
    const keep: Card[] = [];
    const discardIdxs = new Set(action.discardIdxs);
    p.hand.forEach((c, i) => {
      if (!discardIdxs.has(i)) keep.push(c);
    });
    const numDraw = 5 - keep.length;
    const newCards: Card[] = [];
    for (let i = 0; i < numDraw; i++) newCards.push(state.deck.pop()!);
    p.hand = [...keep, ...newCards];
    p.hasDrawn = true;
    p.drawnCount = numDraw;
    log(state, `${p.name} draws ${numDraw}`);
    advanceDrawerOrFinish(state);
    return;
  }

  // betting action
  const idx = state.toActIdx;
  const p = state.players[idx];
  if (p.status !== "active") {
    advanceTurn(state);
    return;
  }
  const callAmount = state.currentBet - p.bet;

  switch (action.type) {
    case "fold":
      p.status = "folded";
      log(state, `${p.name} folds`);
      break;
    case "check":
      if (callAmount !== 0) {
        const c = Math.min(callAmount, p.chips);
        postBet(state, idx, c);
        log(state, `${p.name} calls ${c}`);
      } else {
        log(state, `${p.name} checks`);
      }
      break;
    case "call": {
      const c = Math.min(callAmount, p.chips);
      if (c > 0) postBet(state, idx, c);
      log(state, c === 0 ? `${p.name} checks` : `${p.name} calls ${c}`);
      break;
    }
    case "bet": {
      const amount = Math.max(state.config.bigBlind, action.amount);
      const actual = Math.min(amount, p.chips);
      postBet(state, idx, actual);
      state.currentBet = p.bet;
      state.minRaise = actual;
      for (let i = 0; i < state.players.length; i++) {
        if (i !== idx && state.players[i].status === "active")
          state.players[i].hasActed = false;
      }
      log(state, `${p.name} bets ${actual}`);
      break;
    }
    case "raise": {
      const targetTotal = Math.min(action.toAmount, p.bet + p.chips);
      const raiseSize = targetTotal - state.currentBet;
      const totalToAdd = targetTotal - p.bet;
      if (totalToAdd <= 0) {
        log(state, `${p.name} checks`);
        break;
      }
      postBet(state, idx, totalToAdd);
      if (raiseSize >= state.minRaise) state.minRaise = raiseSize;
      state.currentBet = p.bet;
      for (let i = 0; i < state.players.length; i++) {
        if (i !== idx && state.players[i].status === "active")
          state.players[i].hasActed = false;
      }
      const allInSuffix = p.chips === 0 ? " — ALL IN" : "";
      log(state, `${p.name} raises to ${state.currentBet}${allInSuffix}`);
      break;
    }
    case "draw":
      return; // not in draw phase
  }
  p.hasActed = true;

  if (notFoldedCount(state.players) === 1) {
    const winner = state.players.find(
      (pp) => pp.status === "active" || pp.status === "allin",
    )!;
    awardPot(state, [winner.id], "all others folded");
    state.stage = "handover";
    return;
  }

  if (isBettingRoundDone(state)) {
    advanceStage(state);
  } else {
    advanceTurn(state);
  }
}

function advanceTurn(state: DrawState): void {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (state.toActIdx + i) % n;
    if (state.players[idx].status === "active") {
      state.toActIdx = idx;
      return;
    }
  }
}

function isBettingRoundDone(state: DrawState): boolean {
  const active = state.players.filter((p) => p.status === "active");
  if (active.length === 0) return true;
  for (const p of active) {
    if (!p.hasActed) return false;
    if (p.bet !== state.currentBet) return false;
  }
  return true;
}

function advanceStage(state: DrawState): void {
  for (const p of state.players) {
    p.bet = 0;
    p.hasActed = false;
  }
  state.currentBet = 0;
  state.minRaise = state.config.bigBlind;

  if (state.stage === "predraw") {
    state.stage = "drawing";
    log(state, `--- Draw ---`);
    // first non-folded after dealer
    const firstDrawer = nextActiveOrAllin(state.players, state.dealerIdx);
    state.toActIdx = firstDrawer;
    advanceDrawerOrFinish(state);
    return;
  }
  if (state.stage === "postdraw") {
    showdown(state);
    state.stage = "handover";
    return;
  }
}

function nextActiveOrAllin(players: DrawPlayer[], startIdx: number): number {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (startIdx + i) % n;
    const p = players[idx];
    if (p.status === "active" || p.status === "allin") return idx;
  }
  return startIdx;
}

function advanceDrawerOrFinish(state: DrawState): void {
  // find next active player who hasn't drawn
  const n = state.players.length;
  let found = -1;
  for (let i = 0; i < n; i++) {
    const idx = (state.toActIdx + (i === 0 ? 0 : i)) % n;
    const p = state.players[idx];
    if (p.status === "active" && !p.hasDrawn) {
      found = idx;
      break;
    }
  }
  // if current is done, scan forward
  if (found === -1) {
    for (let i = 1; i <= n; i++) {
      const idx = (state.toActIdx + i) % n;
      const p = state.players[idx];
      if (p.status === "active" && !p.hasDrawn) {
        found = idx;
        break;
      }
    }
  }

  // also handle all-in players: skip draw for them
  if (found === -1) {
    // proceed to postdraw betting
    state.stage = "postdraw";
    log(state, `--- Second betting round ---`);
    state.toActIdx = nextActiveOrAllin(state.players, state.dealerIdx);
    if (activeCount(state.players) <= 1) {
      // skip betting straight to showdown
      showdown(state);
      state.stage = "handover";
    }
    return;
  }
  state.toActIdx = found;
}

function showdown(state: DrawState): void {
  const contenders = state.players.filter(
    (p) => p.status === "active" || p.status === "allin",
  );
  const scored = contenders.map((p) => ({
    id: p.id,
    score: bestHandFromN(p.hand),
  }));
  scored.sort((a, b) => compareScore(b.score, a.score));
  for (const sc of scored) {
    const p = state.players.find((pp) => pp.id === sc.id)!;
    log(
      state,
      `${p.name} shows ${p.hand.map((c) => cardLabel(c)).join(" ")} - ${handCategoryName(sc.score[0])}`,
    );
  }
  const top = scored[0].score;
  const winners = scored.filter((s) => compareScore(s.score, top) === 0);
  awardPot(
    state,
    winners.map((w) => w.id),
    handCategoryName(top[0]),
  );
}

function awardPot(state: DrawState, winnerIds: number[], reason: string): void {
  const share = Math.floor(state.pot / winnerIds.length);
  const remainder = state.pot - share * winnerIds.length;
  state.lastWinners = [];
  winnerIds.forEach((id, i) => {
    const p = state.players.find((pp) => pp.id === id)!;
    const amount = share + (i === 0 ? remainder : 0);
    p.chips += amount;
    state.lastWinners.push({ id, name: p.name, amount, reason });
    log(state, `${p.name} wins ${amount} (${reason})`);
  });
  state.pot = 0;
}

// === Bot AI for draw ===

function handStrengthDraw(hand: Card[]): {
  strength: number;
  category: number;
  discardIdxs: number[];
} {
  const score = bestHandFromN(hand);
  const cat = score[0];

  // Determine which to discard based on category
  const counts: Record<number, number> = {};
  hand.forEach((c) => (counts[c.rank] = (counts[c.rank] || 0) + 1));

  const suitsCount: Record<string, number> = {};
  hand.forEach((c) => (suitsCount[c.suit] = (suitsCount[c.suit] || 0) + 1));
  const flushSuit = Object.entries(suitsCount).find(([_, c]) => c === 4)?.[0];

  let discardIdxs: number[] = [];

  if (cat >= 7) {
    // full house+ — keep all
    discardIdxs = [];
  } else if (cat === 6 || cat === 5 || cat === 9) {
    // flush, straight, straight flush — keep all
    discardIdxs = [];
  } else if (cat === 8) {
    // four of a kind — discard kicker
    hand.forEach((c, i) => {
      if (counts[c.rank] === 1) discardIdxs.push(i);
    });
  } else if (cat === 4) {
    // three of a kind — discard 2 kickers
    hand.forEach((c, i) => {
      if (counts[c.rank] === 1) discardIdxs.push(i);
    });
  } else if (cat === 3) {
    // two pair — discard kicker
    hand.forEach((c, i) => {
      if (counts[c.rank] === 1) discardIdxs.push(i);
    });
  } else if (cat === 2) {
    // pair — discard 3 kickers
    hand.forEach((c, i) => {
      if (counts[c.rank] === 1) discardIdxs.push(i);
    });
  } else {
    // high card — check for 4-flush draw
    if (flushSuit) {
      hand.forEach((c, i) => {
        if (c.suit !== flushSuit) discardIdxs.push(i);
      });
    } else {
      // keep top 1 or 2 cards
      const sorted = hand
        .map((c, i) => ({ rank: c.rank, idx: i }))
        .sort((a, b) => b.rank - a.rank);
      const keep = sorted.slice(0, 1).map((x) => x.idx);
      hand.forEach((_, i) => {
        if (!keep.includes(i)) discardIdxs.push(i);
      });
    }
  }

  // strength baseline
  const map: Record<number, number> = {
    1: 0.15,
    2: 0.4,
    3: 0.65,
    4: 0.78,
    5: 0.85,
    6: 0.88,
    7: 0.93,
    8: 0.97,
    9: 0.99,
  };
  let strength = map[cat] ?? 0.15;
  if (cat === 1 && flushSuit) strength = 0.35; // flush draw
  if (cat === 2 && score[1] >= 11) strength += 0.05; // jacks or better
  return { strength, category: cat, discardIdxs };
}

export function botDecideDraw(state: DrawState): DrawAction {
  const p = state.players[state.toActIdx];
  if (state.stage === "drawing") {
    const { discardIdxs } = handStrengthDraw(p.hand);
    return { type: "draw", discardIdxs };
  }

  const legal = legalDrawActions(state);
  const { strength } = handStrengthDraw(p.hand);
  const wiggle = (Math.random() - 0.5) * 0.1;
  const s = Math.max(0, Math.min(1, strength + wiggle));
  const callAmount = legal.callAmount;
  const potOdds = callAmount > 0 ? callAmount / (state.pot + callAmount) : 0;

  if (callAmount === 0) {
    if (s > 0.7 && Math.random() < 0.65) {
      const sizing = Math.max(
        state.config.bigBlind,
        Math.floor(state.pot * (0.4 + Math.random() * 0.5)),
      );
      const amount = Math.min(sizing, p.chips);
      return { type: "bet", amount };
    }
    if (s > 0.5 && Math.random() < 0.4) {
      const amount = Math.min(
        Math.max(state.config.bigBlind, Math.floor(state.pot * 0.4)),
        p.chips,
      );
      return { type: "bet", amount };
    }
    return { type: "check" };
  }

  if (s < potOdds - 0.05) {
    if (Math.random() < 0.04 && legal.canRaise) {
      const target = Math.min(state.currentBet * 2, p.bet + p.chips);
      return { type: "raise", toAmount: target };
    }
    return { type: "fold" };
  }

  if (s > 0.8 && legal.canRaise && Math.random() < 0.6) {
    const raiseTo = Math.min(
      state.currentBet + Math.max(state.minRaise, Math.floor(state.pot * 0.6)),
      p.bet + p.chips,
    );
    return { type: "raise", toAmount: raiseTo };
  }

  if (s > 0.55 || callAmount <= state.config.bigBlind * 2) {
    return { type: "call" };
  }

  return { type: "fold" };
}

export function isHandOverDraw(state: DrawState): boolean {
  return state.stage === "handover";
}

export function gameOverDraw(state: DrawState): boolean {
  const human = state.players.find((p) => p.isHuman);
  const nonOut = state.players.filter((p) => p.status !== "out");
  return (human != null && human.status === "out") || nonOut.length <= 1;
}
