import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { db, accountsTable, sessionsTable, type Account } from "@workspace/db";
import { eq } from "drizzle-orm";

const PBKDF2_ITERS = 120_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";

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
  const trimmed = name.trim();
  return /^[A-Za-z0-9_-]{3,20}$/.test(trimmed);
}

function isValidPassword(pw: unknown): pw is string {
  return typeof pw === "string" && pw.length >= 6 && pw.length <= 200;
}

function publicProfile(a: Account) {
  return {
    username: a.username,
    bank: a.bank,
    inventory: a.inventory ?? [],
    equipped: a.equipped ?? {},
  };
}

async function getAccountByToken(token: string): Promise<Account | null> {
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.token, token))
    .limit(1);
  if (rows.length === 0) return null;
  const accRows = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, rows[0].accountId))
    .limit(1);
  return accRows[0] ?? null;
}

interface AuthedRequest extends Request {
  account: Account;
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.header("authorization") ?? "";
  const match = auth.match(/^Bearer (.+)$/i);
  if (!match) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const account = await getAccountByToken(match[1].trim());
  if (!account) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as AuthedRequest).account = account;
  next();
}

const router: IRouter = Router();

router.post("/auth/signup", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (!isValidUsername(username)) {
      res.status(400).json({
        error: "Username must be 3-20 letters, numbers, _ or -",
      });
      return;
    }
    if (!isValidPassword(password)) {
      res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
      return;
    }
    const trimmed = (username as string).trim();
    const existing = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.username, trimmed))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    const [created] = await db
      .insert(accountsTable)
      .values({
        username: trimmed,
        passwordHash: hashPassword(password as string),
        bank: 0,
        inventory: [],
        equipped: {},
      })
      .returning();
    const token = newToken();
    await db.insert(sessionsTable).values({ token, accountId: created.id });
    res.json({ token, profile: publicProfile(created) });
  } catch (e) {
    req.log?.error?.({ err: e }, "signup failed");
    res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Missing credentials" });
      return;
    }
    const trimmed = username.trim();
    const rows = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.username, trimmed))
      .limit(1);
    if (rows.length === 0 || !verifyPassword(password, rows[0].passwordHash)) {
      res.status(401).json({ error: "Wrong username or password" });
      return;
    }
    const token = newToken();
    await db.insert(sessionsTable).values({ token, accountId: rows[0].id });
    res.json({ token, profile: publicProfile(rows[0]) });
  } catch (e) {
    req.log?.error?.({ err: e }, "login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  try {
    const auth = req.header("authorization") ?? "";
    const match = auth.match(/^Bearer (.+)$/i);
    if (match) {
      await db.delete(sessionsTable).where(eq(sessionsTable.token, match[1].trim()));
    }
    res.json({ ok: true });
  } catch (e) {
    req.log?.error?.({ err: e }, "logout failed");
    res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  res.json({ profile: publicProfile((req as AuthedRequest).account) });
});

router.post("/auth/profile", requireAuth, async (req, res) => {
  try {
    const account = (req as AuthedRequest).account;
    const { bank, inventory, equipped } = req.body ?? {};
    const patch: Partial<typeof accountsTable.$inferInsert> = {};
    if (bank !== undefined) {
      if (!Number.isFinite(bank) || bank < 0) {
        res.status(400).json({ error: "Invalid bank" });
        return;
      }
      patch.bank = Math.floor(bank);
    }
    if (inventory !== undefined) {
      if (
        !Array.isArray(inventory) ||
        !inventory.every((x) => typeof x === "string")
      ) {
        res.status(400).json({ error: "Invalid inventory" });
        return;
      }
      patch.inventory = inventory as string[];
    }
    if (equipped !== undefined) {
      if (typeof equipped !== "object" || equipped === null) {
        res.status(400).json({ error: "Invalid equipped" });
        return;
      }
      patch.equipped = equipped as Record<string, string>;
    }
    if (Object.keys(patch).length === 0) {
      res.json({ profile: publicProfile(account) });
      return;
    }
    const [updated] = await db
      .update(accountsTable)
      .set(patch)
      .where(eq(accountsTable.id, account.id))
      .returning();
    res.json({ profile: publicProfile(updated) });
  } catch (e) {
    req.log?.error?.({ err: e }, "profile update failed");
    res.status(500).json({ error: "Profile update failed" });
  }
});

export default router;
