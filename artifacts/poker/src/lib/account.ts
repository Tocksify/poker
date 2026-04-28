// Client-side account store: token in localStorage, profile mirrored locally.
// Online play requires a logged-in account. Bank + inventory + equipped are
// persisted server-side and synced via /api/auth/profile.

const TOKEN_KEY = "poker-account-token-v1";
const PROFILE_CACHE_KEY = "poker-account-profile-v1";

export interface AccountProfile {
  username: string;
  bank: number;
  inventory: string[];
  equipped: { cardBack?: string; nameColor?: string; title?: string };
}

let token: string | null = null;
let profile: AccountProfile | null = null;
const listeners = new Set<() => void>();

function api(path: string): string {
  // The api-server is mounted under /api by the platform path-router.
  return `/api${path}`;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function readCachedProfile(): AccountProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj?.username === "string") return obj as AccountProfile;
  } catch {}
  return null;
}

function writeCachedProfile(p: AccountProfile | null) {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {}
}

function notify() {
  listeners.forEach((l) => l());
}

token = readToken();
profile = readCachedProfile();

export function getAccount(): AccountProfile | null {
  return profile;
}

export function getToken(): string | null {
  return token;
}

export function isLoggedIn(): boolean {
  return token !== null && profile !== null;
}

export function subscribeAccount(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn) as unknown as void;
}

async function postJson<T>(path: string, body: unknown, withAuth = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withAuth && token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(api(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

async function getJson<T>(path: string, withAuth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (withAuth && token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(api(path), { headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

function setAuth(t: string | null, p: AccountProfile | null) {
  token = t;
  profile = p;
  writeToken(t);
  writeCachedProfile(p);
  notify();
}

export async function signUp(username: string, password: string): Promise<AccountProfile> {
  const res = await postJson<{ token: string; profile: AccountProfile }>(
    "/auth/signup",
    { username: username.trim(), password },
  );
  setAuth(res.token, res.profile);
  return res.profile;
}

export async function logIn(username: string, password: string): Promise<AccountProfile> {
  const res = await postJson<{ token: string; profile: AccountProfile }>(
    "/auth/login",
    { username: username.trim(), password },
  );
  setAuth(res.token, res.profile);
  return res.profile;
}

export async function logOut(): Promise<void> {
  if (token) {
    try {
      await postJson("/auth/logout", {}, true);
    } catch {}
  }
  setAuth(null, null);
}

export async function refreshProfile(): Promise<AccountProfile | null> {
  if (!token) return null;
  try {
    const res = await getJson<{ profile: AccountProfile }>("/auth/me");
    setAuth(token, res.profile);
    return res.profile;
  } catch (e) {
    // Token invalid: clear local state.
    setAuth(null, null);
    return null;
  }
}

// Apply a local mutation to the cached profile and push to server.
// Synchronous: optimistically updates local state and notifies subscribers,
// then fires a background PATCH. Returns the updated profile.
export function patchProfileLocal(patch: Partial<AccountProfile>): AccountProfile | null {
  if (!profile) return null;
  const next: AccountProfile = {
    ...profile,
    ...patch,
    inventory: patch.inventory ?? profile.inventory,
    equipped: { ...profile.equipped, ...(patch.equipped ?? {}) },
  };
  profile = next;
  writeCachedProfile(next);
  notify();
  // Background sync (don't await). Last-write-wins.
  if (token) {
    const body: Record<string, unknown> = {};
    if (patch.bank !== undefined) body.bank = next.bank;
    if (patch.inventory !== undefined) body.inventory = next.inventory;
    if (patch.equipped !== undefined) body.equipped = next.equipped;
    if (Object.keys(body).length > 0) {
      void postJson("/auth/profile", body, true).catch(() => {
        /* swallow — UI keeps optimistic value */
      });
    }
  }
  return next;
}
