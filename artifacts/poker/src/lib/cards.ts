export type Suit = "h" | "d" | "c" | "s";

export interface Card {
  rank: number;
  suit: Suit;
}

export const SUITS: Suit[] = ["h", "d", "c", "s"];

export const RANK_NAMES: Record<number, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  h: "\u2665",
  d: "\u2666",
  c: "\u2663",
  s: "\u2660",
};

export function isRedSuit(s: Suit): boolean {
  return s === "h" || s === "d";
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) {
      deck.push({ rank: r, suit: s });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardLabel(c: Card): string {
  return `${RANK_NAMES[c.rank]}${SUIT_SYMBOLS[c.suit]}`;
}

// Returns a comparable score: [category, ...tiebreakers]
// category: 9=straight flush, 8=four kind, 7=full house, 6=flush, 5=straight,
//           4=three kind, 3=two pair, 2=pair, 1=high card
export function evalHand5(cards: Card[]): number[] {
  if (cards.length !== 5) throw new Error("evalHand5 needs 5 cards");
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);

  const uniqRanks = Array.from(new Set(ranks)).sort((a, b) => b - a);
  let straight = false;
  let straightHigh = 0;
  if (uniqRanks.length === 5) {
    if (uniqRanks[0] - uniqRanks[4] === 4) {
      straight = true;
      straightHigh = uniqRanks[0];
    } else if (
      uniqRanks[0] === 14 &&
      uniqRanks[1] === 5 &&
      uniqRanks[2] === 4 &&
      uniqRanks[3] === 3 &&
      uniqRanks[4] === 2
    ) {
      straight = true;
      straightHigh = 5;
    }
  }

  const counts: Record<number, number> = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ rank: Number(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  if (straight && flush) return [9, straightHigh];
  if (groups[0].count === 4) return [8, groups[0].rank, groups[1].rank];
  if (groups[0].count === 3 && groups[1].count === 2)
    return [7, groups[0].rank, groups[1].rank];
  if (flush) return [6, ...ranks];
  if (straight) return [5, straightHigh];
  if (groups[0].count === 3)
    return [4, groups[0].rank, groups[1].rank, groups[2].rank];
  if (groups[0].count === 2 && groups[1].count === 2)
    return [3, groups[0].rank, groups[1].rank, groups[2].rank];
  if (groups[0].count === 2)
    return [2, groups[0].rank, groups[1].rank, groups[2].rank, groups[3].rank];
  return [1, ...ranks];
}

export function compareScore(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function bestHandFromN(cards: Card[]): number[] {
  if (cards.length === 5) return evalHand5(cards);
  if (cards.length < 5) throw new Error("need 5+ cards");
  let best: number[] | null = null;
  const n = cards.length;
  // pick 5 of n by skipping (n-5) cards
  const skip = n - 5;
  if (skip === 2) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const five: Card[] = [];
        for (let k = 0; k < n; k++) if (k !== i && k !== j) five.push(cards[k]);
        const score = evalHand5(five);
        if (!best || compareScore(score, best) > 0) best = score;
      }
    }
  } else {
    // generic
    const idx = Array.from({ length: n }, (_, i) => i);
    const combos = combinations(idx, 5);
    for (const combo of combos) {
      const five = combo.map((i) => cards[i]);
      const score = evalHand5(five);
      if (!best || compareScore(score, best) > 0) best = score;
    }
  }
  return best!;
}

function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  const combo: T[] = [];
  function helper(start: number) {
    if (combo.length === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1);
      combo.pop();
    }
  }
  helper(0);
  return result;
}

export function handCategoryName(cat: number): string {
  return [
    "",
    "High Card",
    "Pair",
    "Two Pair",
    "Three of a Kind",
    "Straight",
    "Flush",
    "Full House",
    "Four of a Kind",
    "Straight Flush",
  ][cat];
}
