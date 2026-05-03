import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const PBKDF2_ITERS = 120_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";

let db: DatabaseSync;

interface RawAccount {
  id: number;
  username: string;
  password_hash: string;
  bank: number;
  inventory: string;
  equipped: string;
  created_at: number;
}

function parseAccount(raw: RawAccount) {
  return {
    id: raw.id,
    username: raw.username,
    passwordHash: raw.password_hash,
    bank: raw.bank,
    inventory: JSON.parse(raw.inventory || "[]") as string[],
    equipped: JSON.parse(raw.equipped || "{}") as {
      cardBack?: string;
      nameColor?: string;
      title?: string;
    },
  };
}

type ParsedAccount = ReturnType<typeof parseAccount>;

function publicProfile(a: ParsedAccount) {
  return {
    username: a.username,
    bank: a.bank,
    inventory: a.inventory,
    equipped: a.equipped,
  };
}

export function initDb(dbPath: string): void {
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      bank INTEGER NOT NULL DEFAULT 0,
      inventory TEXT NOT NULL DEFAULT '[]',
      equipped TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions(account_id);
  `);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString("hex");
  return `pbkdf2$${PBKDF2_ITERS}$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iters = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!Number.isFinite(iters) || iters <= 0) return false;
  const hash = crypto
    .pbkdf2Sync(password, salt, iters, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function isValidUsername(name: unknown): name is string {
  if (typeof name !== "string") return false;
  return /^[A-Za-z0-9_-]{3,20}$/.test(name.trim());
}

function isValidPassword(pw: unknown): pw is string {
  return typeof pw === "string" && pw.length >= 6 && pw.length <= 200;
}

function getAccountByToken(token: string): ParsedAccount | null {
  const session = db
    .prepare("SELECT account_id FROM sessions WHERE token = ?")
    .get(token) as { account_id: number } | undefined;
  if (!session) return null;
  const raw = db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(session.account_id) as RawAccount | undefined;
  if (!raw) return null;
  return parseAccount(raw);
}

interface AuthedRequest extends Request {
  account: ParsedAccount;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.header("authorization") ?? "";
  const match = auth.match(/^Bearer (.+)$/i);
  if (!match) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const account = getAccountByToken(match[1].trim());
  if (!account) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as AuthedRequest).account = account;
  next();
}

const router = Router();

router.post("/auth/signup", (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (!isValidUsername(username)) {
      res.status(400).json({ error: "Username must be 3-20 letters, numbers, _ or -" });
      return;
    }
    if (!isValidPassword(password)) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }
    const trimmed = (username as string).trim();
    const existing = db
      .prepare("SELECT id FROM accounts WHERE username = ?")
      .get(trimmed);
    if (existing) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    db.prepare(
      "INSERT INTO accounts (username, password_hash, bank, inventory, equipped) VALUES (?, ?, 0, '[]', '{}')",
    ).run(trimmed, hashPassword(password as string));
    const result = db
      .prepare("SELECT * FROM accounts WHERE username = ?")
      .get(trimmed) as RawAccount;
    const token = newToken();
    db.prepare("INSERT INTO sessions (token, account_id) VALUES (?, ?)").run(
      token,
      result.id,
    );
    res.json({ token, profile: publicProfile(parseAccount(result)) });
  } catch (e) {
    console.error("signup failed", e);
    res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/auth/login", (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Missing credentials" });
      return;
    }
    const raw = db
      .prepare("SELECT * FROM accounts WHERE username = ?")
      .get(username.trim()) as RawAccount | undefined;
    if (!raw || !verifyPassword(password, raw.password_hash)) {
      res.status(401).json({ error: "Wrong username or password" });
      return;
    }
    const token = newToken();
    db.prepare("INSERT INTO sessions (token, account_id) VALUES (?, ?)").run(
      token,
      raw.id,
    );
    res.json({ token, profile: publicProfile(parseAccount(raw)) });
  } catch (e) {
    console.error("login failed", e);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/logout", requireAuth, (req, res) => {
  try {
    const auth = req.header("authorization") ?? "";
    const match = auth.match(/^Bearer (.+)$/i);
    if (match) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(match[1].trim());
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("logout failed", e);
    res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({ profile: publicProfile((req as AuthedRequest).account) });
});

router.post("/auth/profile", requireAuth, (req, res) => {
  try {
    const account = (req as AuthedRequest).account;
    const { bank, inventory, equipped } = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];

    if (bank !== undefined) {
      if (!Number.isFinite(bank) || bank < 0) {
        res.status(400).json({ error: "Invalid bank" });
        return;
      }
      updates.push("bank = ?");
      params.push(Math.floor(bank as number));
    }
    if (inventory !== undefined) {
      if (!Array.isArray(inventory) || !inventory.every((x) => typeof x === "string")) {
        res.status(400).json({ error: "Invalid inventory" });
        return;
      }
      updates.push("inventory = ?");
      params.push(JSON.stringify(inventory));
    }
    if (equipped !== undefined) {
      if (typeof equipped !== "object" || equipped === null) {
        res.status(400).json({ error: "Invalid equipped" });
        return;
      }
      updates.push("equipped = ?");
      params.push(JSON.stringify(equipped));
    }

    if (updates.length === 0) {
      res.json({ profile: publicProfile(account) });
      return;
    }

    params.push(account.id);
    db.prepare(`UPDATE accounts SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    const updated = db
      .prepare("SELECT * FROM accounts WHERE id = ?")
      .get(account.id) as RawAccount;
    res.json({ profile: publicProfile(parseAccount(updated)) });
  } catch (e) {
    console.error("profile update failed", e);
    res.status(500).json({ error: "Profile update failed" });
  }
});

export default router;
