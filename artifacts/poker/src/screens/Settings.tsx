import { useEffect, useState } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import {
  getAccount,
  isLoggedIn,
  logIn,
  logOut,
  refreshProfile,
  signUp,
  subscribeAccount,
  type AccountProfile,
} from "@/lib/account";
import { nameColorValue, titleLabel } from "@/lib/cosmetics";

interface Settings {
  playerName: string;
  showCardHints: boolean;
  fastBots: boolean;
}

interface Props {
  onNavigate: (s: Screen) => void;
  settings: Settings;
  onSave: (s: Settings) => void;
}

export function SettingsScreen({ onNavigate, settings, onSave }: Props) {
  const [local, setLocal] = useState<Settings>(settings);
  const [account, setAccount] = useState<AccountProfile | null>(() => getAccount());
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeAccount(() => setAccount(getAccount()));
    // Refresh profile from server in case bank changed elsewhere.
    if (isLoggedIn()) void refreshProfile();
    return unsub;
  }, []);

  function saveLocal() {
    onSave({ ...local, playerName: local.playerName.trim() });
    onNavigate("menu");
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        if (pw !== pw2) {
          setErr("Passwords do not match");
          return;
        }
        await signUp(user, pw);
      } else {
        await logIn(user, pw);
      }
      setUser("");
      setPw("");
      setPw2("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await logOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Window
      title="Settings"
      className="setup-window"
      onClose={() => onNavigate("menu")}
    >
      <fieldset className="fieldset">
        <legend>Account</legend>
        {account ? (
          <div>
            <div style={{ marginBottom: 6 }}>
              Signed in as{" "}
              <strong
                style={{
                  color: nameColorValue(account.equipped),
                  textShadow: "0 0 1px rgba(0,0,0,0.6)",
                }}
              >
                {titleLabel(account.equipped)
                  ? `${titleLabel(account.equipped)} `
                  : ""}
                {account.username}
              </strong>
            </div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
              Bank: {account.bank.toLocaleString()} chips · Owned items:{" "}
              {account.inventory.length}
            </div>
            <button
              className="btn"
              onClick={handleLogout}
              disabled={busy}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <form onSubmit={submitAuth}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button
                type="button"
                className={`btn ${mode === "login" ? "btn-primary" : ""}`}
                onClick={() => {
                  setMode("login");
                  setErr(null);
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`btn ${mode === "signup" ? "btn-primary" : ""}`}
                onClick={() => {
                  setMode("signup");
                  setErr(null);
                }}
              >
                Create Account
              </button>
            </div>
            <div className="form-row">
              <label htmlFor="acc-user">Username:</label>
              <input
                id="acc-user"
                className="input"
                type="text"
                value={user}
                maxLength={20}
                placeholder="3-20 letters/numbers"
                autoComplete="username"
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="acc-pw">Password:</label>
              <input
                id="acc-pw"
                className="input"
                type="password"
                value={pw}
                placeholder="At least 6 characters"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
            {mode === "signup" && (
              <div className="form-row">
                <label htmlFor="acc-pw2">Confirm:</label>
                <input
                  id="acc-pw2"
                  className="input"
                  type="password"
                  value={pw2}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  onChange={(e) => setPw2(e.target.value)}
                />
              </div>
            )}
            {err && (
              <div style={{ color: "#f99", padding: "4px 0", fontSize: 12 }}>
                {err}
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || user.trim().length < 3 || pw.length < 6}
              >
                {busy
                  ? "Working..."
                  : mode === "signup"
                    ? "Create Account"
                    : "Sign In"}
              </button>
              <span className="muted" style={{ marginLeft: 12, fontSize: 11 }}>
                Required to play Online. Saves your bank and shop items.
              </span>
            </div>
          </form>
        )}
      </fieldset>

      <fieldset className="fieldset">
        <legend>Single-Player Display Name</legend>
        <div className="form-row">
          <label htmlFor="player-name">Name:</label>
          <input
            id="player-name"
            className="input"
            type="text"
            value={local.playerName}
            maxLength={24}
            placeholder="Used as the seat label when not signed in"
            onChange={(e) =>
              setLocal({ ...local, playerName: e.target.value })
            }
          />
        </div>
        <div
          style={{ marginTop: 4, paddingLeft: 170, fontSize: 11 }}
          className="dim"
        >
          When signed in, your account username is used instead.
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Gameplay</legend>
        <div className="form-row">
          <label htmlFor="show-hints">Hand Hints:</label>
          <div>
            <input
              id="show-hints"
              type="checkbox"
              checked={local.showCardHints}
              onChange={(e) =>
                setLocal({ ...local, showCardHints: e.target.checked })
              }
            />
            <span style={{ marginLeft: 8 }}>
              Show your current best hand at the table
            </span>
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="fast-bots">Fast Bots:</label>
          <div>
            <input
              id="fast-bots"
              type="checkbox"
              checked={local.fastBots}
              onChange={(e) =>
                setLocal({ ...local, fastBots: e.target.checked })
              }
            />
            <span style={{ marginLeft: 8 }}>
              Bots act with no thinking delay (single player)
            </span>
          </div>
        </div>
      </fieldset>

      <div className="button-row">
        <button className="btn btn-primary" onClick={saveLocal}>
          Save
        </button>
        <button className="btn" onClick={() => onNavigate("menu")}>
          Back
        </button>
      </div>
    </Window>
  );
}
