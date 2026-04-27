import { useEffect } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import { usePokerSocket } from "@/lib/wsClient";

interface Props {
  onNavigate: (s: Screen) => void;
}

export function OnlineLobby({ onNavigate }: Props) {
  const ws = usePokerSocket();
  const lobby = ws.lobby;

  // If game starts, jump to game
  useEffect(() => {
    if (ws.game) {
      onNavigate("online-game");
    }
  }, [ws.game, onNavigate]);

  // If lobby is gone (we left or got kicked), go back
  useEffect(() => {
    if (!ws.lobby && !ws.game) {
      onNavigate("online");
    }
  }, [ws.lobby, ws.game, onNavigate]);

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
  const canStart =
    seatedPlayers >= 2 || (lobby.config.fillBots && seatedPlayers >= 1);

  function copyCode() {
    if (!lobby) return;
    navigator.clipboard?.writeText(lobby.code).catch(() => {});
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
              className={`player-list-row ${p.isBot ? "bot" : ""} ${
                p.isHost ? "host" : ""
              }`}
            >
              <div>
                <strong>{p.name}</strong>
                {p.isHost && <span className="player-badge host">HOST</span>}
                {p.isYou && <span className="player-badge you">YOU</span>}
                {p.isBot && <span className="player-badge bot">BOT</span>}
              </div>
              {isHost && !p.isYou && (
                <button
                  className="btn"
                  style={{ minWidth: 0, padding: "2px 8px", fontSize: 11 }}
                  onClick={() =>
                    ws.send({
                      type: "removeSeat",
                      payload: { seatId: p.id },
                    })
                  }
                >
                  Remove
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
            Blinds: <strong>{lobby.config.smallBlind}</strong>/
            <strong>{lobby.config.bigBlind}</strong>
            {lobby.config.gameType === "draw" && lobby.config.ante > 0 && (
              <>
                {" "}
                · Ante: <strong>{lobby.config.ante}</strong>
              </>
            )}
          </div>
          <div>
            Starting chips:{" "}
            <strong>{lobby.config.startingChips.toLocaleString()}</strong>
          </div>
          <div>
            Fill empty seats with bots:{" "}
            <strong>{lobby.config.fillBots ? "Yes" : "No"}</strong>
          </div>
        </div>
      </fieldset>

      {ws.error && (
        <div style={{ color: "#f99", padding: "4px 0" }}>{ws.error}</div>
      )}

      <div className="button-row">
        {isHost && emptySeats > 0 && (
          <button
            className="btn"
            onClick={() => ws.send({ type: "addBot" })}
          >
            + Add Bot
          </button>
        )}
        {isHost && (
          <button
            className="btn btn-primary"
            disabled={!canStart}
            onClick={() => ws.send({ type: "start" })}
            title={
              !canStart ? "Need at least 2 players (or enable fill bots)" : ""
            }
          >
            Start Game
          </button>
        )}
        {!isHost && (
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
