import { useEffect, useState } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import { usePokerSocket } from "@/lib/wsClient";
import { withdrawFromBank } from "@/lib/bank";

interface Props {
  onNavigate: (s: Screen) => void;
  bank: number;
}

export function OnlineLobby({ onNavigate, bank }: Props) {
  const ws = usePokerSocket();
  const lobby = ws.lobby;
  const [buyInAmt, setBuyInAmt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (ws.game) {
      onNavigate("online-game");
    }
  }, [ws.game, onNavigate]);

  useEffect(() => {
    if (!ws.lobby && !ws.game) {
      onNavigate("online");
    }
  }, [ws.lobby, ws.game, onNavigate]);

  // Tick countdown
  useEffect(() => {
    if (!lobby?.buyInDeadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [lobby?.buyInDeadline]);

  // When buy-in window opens, default to a sensible amount
  useEffect(() => {
    if (lobby?.phase === "buyIn" && lobby.yourBuyIn == null) {
      const bb = lobby.config.bigBlind;
      const suggested = Math.min(
        bank,
        Math.max(bb, lobby.config.startingChips || bb * 50),
      );
      setBuyInAmt(suggested);
    }
  }, [lobby?.phase, lobby?.config.bigBlind, lobby?.yourBuyIn, bank]);

  if (!lobby) {
    return (
      <Window
        title="Lobby"
        className="lobby-window"
        onClose={() => onNavigate("online")}
      >
        <div className="muted" style={{ padding: 12 }}>
          Loading lobby...
        </div>
      </Window>
    );
  }

  const isHost = lobby.yourId === lobby.hostId;
  const seatedPlayers = lobby.players.length;
  const emptySeats = lobby.config.maxPlayers - seatedPlayers;
  const inBuyIn = lobby.phase === "buyIn";
  const buyInRemaining = lobby.buyInDeadline
    ? Math.max(0, lobby.buyInDeadline - now)
    : 0;
  const buyInsCount = lobby.buyInsSubmitted.length;
  const youSubmitted = lobby.yourBuyIn != null;

  function copyCode() {
    if (!lobby) return;
    navigator.clipboard?.writeText(lobby.code).catch(() => {});
  }

  function submitBuyIn() {
    if (!lobby) return;
    const bb = lobby.config.bigBlind;
    const amt = Math.max(bb, Math.min(bank, Math.floor(buyInAmt) || 0));
    // Optimistic withdrawal — server uses the amount as starting chips
    withdrawFromBank(amt);
    ws.send({ type: "buyIn", payload: { amount: amt } });
  }

  return (
    <Window
      title={`Lobby — ${
        lobby.config.gameType === "holdem" ? "Texas Hold'em" : "Five Card Draw"
      }`}
      className="lobby-window"
      onClose={() => ws.send({ type: "leave" })}
    >
      <div style={{ marginBottom: 8 }}>
        <div className="muted" style={{ textAlign: "center", fontSize: 12 }}>
          Share this invite code with friends
          {lobby.config.isPublic && " · also listed publicly"}
        </div>
        <div
          className="invite-code"
          onClick={copyCode}
          title="Click to copy"
        >
          {lobby.code}
        </div>
      </div>

      <fieldset className="fieldset">
        <legend>
          Players ({seatedPlayers}/{lobby.config.maxPlayers})
        </legend>
        <div className="player-list">
          {lobby.players.map((p) => (
            <div
              key={p.id}
              className={`player-list-row ${p.isHost ? "host" : ""}`}
            >
              <div>
                <strong>{p.name}</strong>
                {p.isHost && <span className="player-badge host">HOST</span>}
                {p.isYou && <span className="player-badge you">YOU</span>}
                {p.pendingKick && (
                  <span className="player-badge fold">KICK PENDING</span>
                )}
                {inBuyIn && lobby.buyInsSubmitted.includes(p.id) && (
                  <span className="player-badge you">BOUGHT IN</span>
                )}
              </div>
              {isHost && !p.isYou && !p.pendingKick && (
                <button
                  className="btn"
                  style={{ minWidth: 0, padding: "2px 8px", fontSize: 11 }}
                  onClick={() =>
                    ws.send({
                      type: "kick",
                      payload: { seatId: p.id },
                    })
                  }
                >
                  Kick
                </button>
              )}
            </div>
          ))}
          {Array.from({ length: emptySeats }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="player-list-row"
              style={{ opacity: 0.5, fontStyle: "italic" }}
            >
              <div>(empty seat)</div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Settings</legend>
        <div style={{ fontSize: 12 }}>
          <div>
            Game:{" "}
            <strong>
              {lobby.config.gameType === "holdem"
                ? "Texas Hold'em"
                : "Five Card Draw"}
            </strong>
          </div>
          <div>
            Blinds: <strong>{lobby.config.smallBlind}</strong>/
            <strong>{lobby.config.bigBlind}</strong>
            {lobby.config.ante > 0 && (
              <>
                {" "}
                · Ante: <strong>{lobby.config.ante}</strong>
              </>
            )}
          </div>
          <div>
            Suggested buy-in:{" "}
            <strong>{lobby.config.startingChips.toLocaleString()}</strong>
          </div>
          <div>
            Visibility:{" "}
            <strong>{lobby.config.isPublic ? "Public" : "Private"}</strong>
          </div>
        </div>
      </fieldset>

      {inBuyIn && (
        <fieldset className="fieldset" style={{ borderColor: "var(--accent)" }}>
          <legend>
            Buy In ({Math.ceil(buyInRemaining / 1000)}s) —{" "}
            {buyInsCount}/{seatedPlayers} submitted
          </legend>
          {youSubmitted ? (
            <div style={{ fontSize: 12 }}>
              You bought in for <strong>{lobby.yourBuyIn}</strong>. Waiting for
              others...
            </div>
          ) : (
            <>
              <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
                Bank: <strong>{bank.toLocaleString()}</strong>. Min{" "}
                {lobby.config.bigBlind} (one big blind).
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="range"
                  min={Math.min(lobby.config.bigBlind, bank)}
                  max={bank}
                  step={Math.max(1, Math.floor(bank / 100))}
                  value={buyInAmt}
                  onChange={(e) => setBuyInAmt(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  className="input"
                  style={{ width: 90 }}
                  min={lobby.config.bigBlind}
                  max={bank}
                  value={buyInAmt}
                  onChange={(e) => setBuyInAmt(Number(e.target.value))}
                />
                <button
                  className="btn btn-primary"
                  disabled={
                    buyInAmt < lobby.config.bigBlind || buyInAmt > bank
                  }
                  onClick={submitBuyIn}
                >
                  Buy In
                </button>
              </div>
            </>
          )}
        </fieldset>
      )}

      {ws.error && (
        <div style={{ color: "#f99", padding: "4px 0" }}>{ws.error}</div>
      )}

      <div className="button-row">
        {isHost && !inBuyIn && (
          <button
            className="btn btn-primary"
            disabled={seatedPlayers < 2}
            onClick={() => ws.send({ type: "start" })}
            title={
              seatedPlayers < 2
                ? "Need at least 2 players (have friends join with the code)"
                : "Start the buy-in window"
            }
          >
            Start Game
          </button>
        )}
        {isHost && inBuyIn && (
          <div className="dim" style={{ flex: 1, alignSelf: "center" }}>
            Buy-in window open. Game starts when timer ends.
          </div>
        )}
        {!isHost && !inBuyIn && (
          <div className="dim" style={{ flex: 1, alignSelf: "center" }}>
            Waiting for host to start...
          </div>
        )}
        <button
          className="btn btn-danger"
          onClick={() => ws.send({ type: "leave" })}
        >
          Leave
        </button>
      </div>
    </Window>
  );
}
