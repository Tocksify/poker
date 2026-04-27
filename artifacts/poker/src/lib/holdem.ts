import {
  Card,
  bestHandFromN,
  cardLabel,
  compareScore,
  handCategoryName,
  makeDeck,
  shuffle,
} from "./cards";

export type Stage =
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "handover";

export interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  chips: number;
  hole: Card[];
  bet: number; // bet contributed in current round
  totalBet: number; // total contributed this hand
  status: "active" | "folded" | "allin" | "out";
  hasActed: boolean; // acted at least once in current betting round
}

export interface HoldemConfig {
  players: { name: string; isHuman: boolean }[];
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
}

export interface HoldemState {
  config: HoldemConfig;
  players: Player[];
  dealerIdx: number;
  toActIdx: number;
  stage: Stage;
  community: Card[];
  deck: Card[];
  pot: number;
  currentBet: number; // highest bet in current round
  minRaise: number;
  log: string[];
  handNumber: number;
  lastWinners: { id: number; name: string; amount: number; reason: string }[];
}

function nextActiveIdx(
  players: Player[],
  startIdx: number,
  includeAllIn = false,
): number {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (startIdx + i) % n;
    const p = players[idx];
    if (p.status === "active") return idx;
    if (includeAllIn && p.status === "allin") return idx;
  }
  return startIdx;
}

function activeCount(players: Player[]): number {
  return players.filter((p) => p.status === "active").length;
}

function notFoldedCount(players: Player[]): number {
  return players.filter(
    (p) => p.status === "active" || p.status === "allin",
  ).length;
}

export function createHoldemState(config: HoldemConfig): HoldemState {
  const players: Player[] = config.players.map((p, i) => ({
    id: i,
    name: p.name,
    isHuman: p.isHuman,
    chips: config.startingChips,
    hole: [],
    bet: 0,
    totalBet: 0,
    status: "active",
    hasActed: false,
  }));
  const state: HoldemState = {
    config,
    players,
    dealerIdx: 0,
    toActIdx: 0,
    stage: "preflop",
    community: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    minRaise: config.bigBlind,
    log: [],
    handNumber: 0,
    lastWinners: [],
  };
  startHand(state);
  return state;
}

export function startHand(state: HoldemState): void {
  // reset
  for (const p of state.players) {
    p.hole = [];
    p.bet = 0;
    p.totalBet = 0;
    p.hasActed = false;
    if (p.chips <= 0) {
      p.status = "out";
    } else {
      p.status = "active";
    }
  }
  state.community = [];
  state.deck = shuffle(makeDeck());
  state.pot = 0;
  state.currentBet = 0;
  state.minRaise = state.config.bigBlind;
  state.stage = "preflop";
  state.handNumber += 1;
  state.lastWinners = [];

  // move dealer to next non-out player
  if (state.handNumber > 1) {
    state.dealerIdx = nextNonOut(state.players, state.dealerIdx);
  } else {
    // first hand: dealer is first non-out
    if (state.players[state.dealerIdx].status === "out") {
      state.dealerIdx = nextNonOut(state.players, state.dealerIdx);
    }
  }

  // antes
  const ante = state.config.ante ?? 0;
  if (ante > 0) {
    for (let i = 0; i < state.players.length; i++) {
      if (state.players[i].status !== "out") {
        postBet(state, i, ante);
        state.players[i].bet = 0; // antes go to pot but don't count as round bet
      }
    }
  }

  // post blinds
  const sbIdx = nextNonOut(state.players, state.dealerIdx);
  const bbIdx = nextNonOut(state.players, sbIdx);
  postBet(state, sbIdx, state.config.smallBlind);
  postBet(state, bbIdx, state.config.bigBlind);
  state.currentBet = state.config.bigBlind;

  // deal hole cards
  for (let r = 0; r < 2; r++) {
    let idx = sbIdx;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[idx];
      if (p.status !== "out") {
        p.hole.push(state.deck.pop()!);
      }
      idx = (idx + 1) % state.players.length;
    }
  }

  state.toActIdx = nextNonOut(state.players, bbIdx);
  log(
    state,
    `--- Hand #${state.handNumber} --- ${ante > 0 ? `Ante: ${ante}, ` : ""}Blinds: ${state.config.smallBlind}/${state.config.bigBlind}`,
  );
  log(
    state,
    `${state.players[sbIdx].name} posts SB ${state.config.smallBlind}, ${state.players[bbIdx].name} posts BB ${state.config.bigBlind}`,
  );

  // if only 1 active (everyone else out), award immediately
  const remaining = state.players.filter((p) => p.status !== "out");
  if (remaining.length === 1) {
    awardPot(state, [remaining[0].id], "last player standing");
    state.stage = "handover";
  }
}

function nextNonOut(players: Player[], startIdx: number): number {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (startIdx + i) % n;
    if (players[idx].status !== "out") return idx;
  }
  return startIdx;
}

function postBet(state: HoldemState, playerIdx: number, amount: number): void {
  const p = state.players[playerIdx];
  const actual = Math.min(amount, p.chips);
  p.chips -= actual;
  p.bet += actual;
  p.totalBet += actual;
  state.pot += actual;
  if (p.chips === 0) p.status = "allin";
}

function log(state: HoldemState, msg: string): void {
  state.log.push(msg);
  if (state.log.length > 200) state.log.shift();
}

export type Action =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "bet"; amount: number } // when no current bet
  | { type: "raise"; toAmount: number }; // raise total bet to this amount

export function legalActions(state: HoldemState): {
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number; // all-in amount
} {
  const p = state.players[state.toActIdx];
  const callAmount = state.currentBet - p.bet;
  const canCheck = callAmount === 0;
  const canCall = callAmount > 0 && p.chips > 0;
  const canRaise = p.chips > callAmount; // can raise if has chips beyond call
  const minRaiseTo = state.currentBet + state.minRaise;
  const maxRaiseTo = p.bet + p.chips; // bet up to all-in
  return {
    canCheck,
    canCall,
    callAmount: Math.min(callAmount, p.chips),
    canRaise,
    minRaiseTo,
    maxRaiseTo,
  };
}

export function applyAction(state: HoldemState, action: Action): void {
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
        // illegal — treat as call
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
      // reset hasActed for others
      for (let i = 0; i < state.players.length; i++) {
        if (i !== idx && state.players[i].status === "active")
          state.players[i].hasActed = false;
      }
      log(state, `${p.name} bets ${actual}`);
      break;
    }
    case "raise": {
      const targetTotal = Math.min(action.toAmount, p.bet + p.chips);
      const addToCall = state.currentBet - p.bet;
      const raiseSize = targetTotal - state.currentBet;
      const totalToAdd = targetTotal - p.bet;
      if (totalToAdd <= 0) {
        log(state, `${p.name} checks`);
        break;
      }
      postBet(state, idx, totalToAdd);
      if (raiseSize >= state.minRaise) {
        state.minRaise = raiseSize;
      }
      state.currentBet = p.bet;
      // reset hasActed for others
      for (let i = 0; i < state.players.length; i++) {
        if (i !== idx && state.players[i].status === "active")
          state.players[i].hasActed = false;
      }
      const addedTxt = addToCall > 0 ? ` (call ${addToCall} + raise ${raiseSize})` : "";
      const allInSuffix = p.chips === 0 ? " — ALL IN" : "";
      log(
        state,
        `${p.name} raises to ${state.currentBet}${addedTxt}${allInSuffix}`,
      );
      break;
    }
  }
  p.hasActed = true;

  // if only 1 not folded, award immediately
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

function advanceTurn(state: HoldemState): void {
  // find next active player who hasn't acted or who needs to call
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (state.toActIdx + i) % n;
    const p = state.players[idx];
    if (p.status === "active") {
      state.toActIdx = idx;
      return;
    }
  }
}

function isBettingRoundDone(state: HoldemState): boolean {
  const active = state.players.filter((p) => p.status === "active");
  if (active.length === 0) return true;
  for (const p of active) {
    if (!p.hasActed) return false;
    if (p.bet !== state.currentBet) return false;
  }
  return true;
}

function advanceStage(state: HoldemState): void {
  // collect bets to pot already done. Reset bets and hasActed for next round.
  for (const p of state.players) {
    p.bet = 0;
    p.hasActed = false;
  }
  state.currentBet = 0;
  state.minRaise = state.config.bigBlind;

  if (state.stage === "preflop") {
    state.community.push(
      state.deck.pop()!,
      state.deck.pop()!,
      state.deck.pop()!,
    );
    state.stage = "flop";
    log(
      state,
      `Flop: ${state.community.map((c) => cardLabel(c)).join(" ")}`,
    );
  } else if (state.stage === "flop") {
    state.community.push(state.deck.pop()!);
    state.stage = "turn";
    log(state, `Turn: ${cardLabel(state.community[3])}`);
  } else if (state.stage === "turn") {
    state.community.push(state.deck.pop()!);
    state.stage = "river";
    log(state, `River: ${cardLabel(state.community[4])}`);
  } else if (state.stage === "river") {
    showdown(state);
    state.stage = "handover";
    return;
  }

  // if only allin players remain (no one to act), keep dealing
  if (activeCount(state.players) <= 1) {
    advanceStage(state);
    return;
  }

  // first to act after dealer who is active
  state.toActIdx = nextActiveIdx(state.players, state.dealerIdx);
}

function showdown(state: HoldemState): void {
  const contenders = state.players.filter(
    (p) => p.status === "active" || p.status === "allin",
  );
  const scored = contenders.map((p) => ({
    id: p.id,
    score: bestHandFromN([...p.hole, ...state.community]),
  }));
  scored.sort((a, b) => compareScore(b.score, a.score));
  for (const sc of scored) {
    const p = state.players.find((pp) => pp.id === sc.id)!;
    log(
      state,
      `${p.name} shows ${p.hole.map((c) => cardLabel(c)).join(" ")} - ${handCategoryName(sc.score[0])}`,
    );
  }
  // simple winner determination (no side pots: all-in handled simply by sharing)
  const top = scored[0].score;
  const winners = scored.filter((s) => compareScore(s.score, top) === 0);
  awardPot(
    state,
    winners.map((w) => w.id),
    handCategoryName(top[0]),
  );
}

function awardPot(state: HoldemState, winnerIds: number[], reason: string): void {
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

// === Bot AI ===

function preflopStrength(hole: Card[]): number {
  // Returns 0..1
  const [a, b] = hole;
  const high = Math.max(a.rank, b.rank);
  const low = Math.min(a.rank, b.rank);
  const suited = a.suit === b.suit;
  const pair = a.rank === b.rank;
  let s = 0;
  if (pair) {
    // pairs: 22 -> .45, AA -> .95
    s = 0.4 + (a.rank - 2) * 0.045;
  } else {
    s = (high + low) / 50; // 0.16 .. 0.56
    if (suited) s += 0.07;
    const gap = high - low;
    if (gap === 1) s += 0.04;
    else if (gap === 2) s += 0.02;
    else if (gap > 4) s -= 0.05;
    if (high === 14) s += 0.05;
    if (high >= 12 && low >= 10) s += 0.05;
  }
  return Math.max(0, Math.min(1, s));
}

function postflopStrength(hole: Card[], community: Card[]): number {
  const score = bestHandFromN([...hole, ...community]);
  const cat = score[0];
  // Map category to strength
  const map: Record<number, number> = {
    1: 0.1,
    2: 0.3,
    3: 0.55,
    4: 0.7,
    5: 0.78,
    6: 0.85,
    7: 0.9,
    8: 0.95,
    9: 0.99,
  };
  let base = map[cat] ?? 0.1;
  // Bonus for high pairs/high cards
  base += (score[1] ?? 0) / 200;
  return Math.max(0, Math.min(1, base));
}

export function botDecide(state: HoldemState): Action {
  const p = state.players[state.toActIdx];
  const legal = legalActions(state);
  const strength =
    state.community.length === 0
      ? preflopStrength(p.hole)
      : postflopStrength(p.hole, state.community);

  // Add a bit of randomness/personality
  const wiggle = (Math.random() - 0.5) * 0.12;
  const s = Math.max(0, Math.min(1, strength + wiggle));

  const callAmount = legal.callAmount;
  const potOdds = callAmount > 0 ? callAmount / (state.pot + callAmount) : 0;

  // Decision tree
  if (callAmount === 0) {
    // can check or bet
    if (s > 0.7 && Math.random() < 0.7) {
      const sizing = Math.max(
        state.config.bigBlind,
        Math.floor(state.pot * (0.5 + Math.random() * 0.5)),
      );
      const amount = Math.min(sizing, p.chips);
      if (amount === p.chips) return { type: "raise", toAmount: p.bet + amount };
      return { type: "bet", amount };
    }
    if (s > 0.45 && Math.random() < 0.35) {
      const amount = Math.min(
        Math.max(state.config.bigBlind, Math.floor(state.pot * 0.4)),
        p.chips,
      );
      return { type: "bet", amount };
    }
    return { type: "check" };
  }

  // facing a bet
  if (s < potOdds - 0.05) {
    // not worth calling
    if (Math.random() < 0.05 && legal.canRaise) {
      // rare bluff
      const target = Math.min(state.currentBet * 2, p.bet + p.chips);
      return { type: "raise", toAmount: target };
    }
    return { type: "fold" };
  }

  if (s > 0.78 && legal.canRaise && Math.random() < 0.7) {
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

export function isHandOver(state: HoldemState): boolean {
  return state.stage === "handover";
}

export function gameOver(state: HoldemState): boolean {
  // human is out, or only one non-out player
  const human = state.players.find((p) => p.isHuman);
  const nonOut = state.players.filter((p) => p.status !== "out");
  return (human != null && human.status === "out") || nonOut.length <= 1;
}
