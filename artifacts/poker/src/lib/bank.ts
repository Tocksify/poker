// Bank: in-game currency.
// - Logged in: bank is server-backed (lives on the account profile).
//   We treat the cached account profile as the source of truth and PATCH
//   the server in the background via account.patchProfileLocal.
// - Guest: bank is stored in localStorage.

import {
  getAccount,
  patchProfileLocal,
  subscribeAccount,
} from "./account";

const STORAGE_KEY = "poker-bank-v1";
const DAILY_KEY_GUEST = "poker-bank-daily-v1";
const DAILY_KEY_PREFIX = "poker-bank-daily-v1:";

const STARTING_BALANCE = 0;
const DAILY_AMOUNT = 200;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();

// Account changes (login/logout) effectively change the bank value.
subscribeAccount(() => listeners.forEach((l) => l()));

function read(): number {
  const acc = getAccount();
  if (acc) return Math.max(0, Math.floor(acc.bank));
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return STARTING_BALANCE;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : STARTING_BALANCE;
  } catch {
    return STARTING_BALANCE;
  }
}

function write(v: number) {
  const safe = Math.max(0, Math.floor(v));
  const acc = getAccount();
  if (acc) {
    patchProfileLocal({ bank: safe });
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, String(safe));
    } catch {}
    listeners.forEach((l) => l());
  }
}

export function getBank(): number {
  return read();
}

export function setBank(v: number): void {
  write(v);
}

export function depositToBank(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  write(read() + Math.floor(amount));
}

export function withdrawFromBank(amount: number): number {
  const have = read();
  const take = Math.max(0, Math.min(have, Math.floor(amount || 0)));
  write(have - take);
  return take;
}

function dailyKey(): string {
  const acc = getAccount();
  if (acc) return DAILY_KEY_PREFIX + acc.username;
  return DAILY_KEY_GUEST;
}

export function lastDailyClaimAt(): number {
  try {
    const raw = localStorage.getItem(dailyKey());
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function canClaimDaily(): boolean {
  return Date.now() - lastDailyClaimAt() >= DAILY_INTERVAL_MS;
}

export function nextDailyAvailableAt(): number {
  return lastDailyClaimAt() + DAILY_INTERVAL_MS;
}

export function claimDaily(): { ok: boolean; amount: number } {
  if (!canClaimDaily()) return { ok: false, amount: 0 };
  try {
    localStorage.setItem(dailyKey(), String(Date.now()));
  } catch {}
  depositToBank(DAILY_AMOUNT);
  return { ok: true, amount: DAILY_AMOUNT };
}

export const DAILY_CLAIM_AMOUNT = DAILY_AMOUNT;
export const STARTER_FREE_STACK_MULTIPLIER = 10;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
