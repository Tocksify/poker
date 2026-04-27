const STORAGE_KEY = "poker-bank-v1";
const DAILY_KEY = "poker-bank-daily-v1";

const STARTING_BALANCE = 0;
const DAILY_AMOUNT = 200;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();

function read(): number {
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
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(v))));
  } catch {}
  listeners.forEach((l) => l());
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

export function lastDailyClaimAt(): number {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
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
    localStorage.setItem(DAILY_KEY, String(Date.now()));
  } catch {}
  depositToBank(DAILY_AMOUNT);
  return { ok: true, amount: DAILY_AMOUNT };
}

export const DAILY_CLAIM_AMOUNT = DAILY_AMOUNT;
export const STARTER_FREE_STACK_MULTIPLIER = 10; // free stack = 10 * smallBlind when broke

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
