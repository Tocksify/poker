import { useEffect, useState } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import { usePokerSocket } from "@/lib/wsClient";

interface Props {
  onNavigate: (s: Screen) => void;
  playerName: string;
}

export function JoinRoom({ onNavigate, playerName }: Props) {
  const ws = usePokerSocket();
  const [code, setCode] = useState("");

  useEffect(() => {
    if (ws.lobby && ws.lobby.status === "lobby") {
      onNavigate("online-lobby");
    }
    if (ws.game) {
      onNavigate("online-game");
    }
  }, [ws.lobby, ws.game, onNavigate]);

  // Poll public rooms every 3s
  useEffect(() => {
    if (ws.status !== "open") return;
    ws.send({ type: "listPublic" });
    const id = window.setInterval(() => {
      ws.send({ type: "listPublic" });
    }, 3000);
    return () => window.clearInterval(id);
  }, [ws.status]);

  function handleJoin(roomCode?: string) {
    const trimmed = (roomCode ?? code).trim().toUpperCase();
    if (trimmed.length < 3) return;
    ws.clearError();
    ws.send({ type: "join", payload: { code: trimmed, name: playerName } });
  }

  return (
    <Window
      title="Join Room"
      className="online-window"
      onClose={() => onNavigate("online")}
    >
      <div style={{ padding: "8px 4px" }}>
        <fieldset className="fieldset">
          <legend>Invite Code</legend>
          <div className="form-row">
            <label htmlFor="jr-code">Enter code:</label>
            <input
              id="jr-code"
              className="input"
              type="text"
              value={code}
              placeholder="e.g. AB3CD"
              maxLength={8}
              style={{
                textTransform: "uppercase",
                letterSpacing: 4,
                fontFamily: "Lucida Console, monospace",
                fontSize: 16,
              }}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
            />
            <button
              className="btn btn-primary"
              disabled={ws.status !== "open" || code.trim().length < 3}
              onClick={() => handleJoin()}
            >
              Join
            </button>
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            Joining as <strong>{playerName}</strong>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Public Rooms</legend>
          {ws.publicRooms.length === 0 ? (
            <div className="muted" style={{ padding: "8px 0", fontSize: 12 }}>
              No public rooms right now. Why not create one?
            </div>
          ) : (
            <div className="public-rooms-list">
              <div className="public-rooms-row header">
                <div>Game</div>
                <div>Stakes</div>
                <div>Players</div>
                <div>Status</div>
                <div></div>
              </div>
              {ws.publicRooms.map((r) => {
                const stakes =
                  r.gameType === "draw" && r.ante > 0
                    ? `${r.smallBlind}/${r.bigBlind} (a${r.ante})`
                    : r.ante > 0
                      ? `${r.smallBlind}/${r.bigBlind} (a${r.ante})`
                      : `${r.smallBlind}/${r.bigBlind}`;
                const isFull = r.playerCount >= r.maxPlayers;
                return (
                  <div className="public-rooms-row" key={r.code}>
                    <div>
                      {r.gameType === "holdem" ? "Hold'em" : "Draw"}
                    </div>
                    <div>{stakes}</div>
                    <div>
                      {r.playerCount}/{r.maxPlayers}
                    </div>
                    <div>
                      {r.status === "lobby"
                        ? "Lobby"
                        : `Hand #${r.handNumber}`}
                    </div>
                    <div>
                      <button
                        className="btn"
                        disabled={ws.status !== "open" || isFull}
                        onClick={() => handleJoin(r.code)}
                        title={isFull ? "Room is full" : "Join this room"}
                      >
                        Join
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </fieldset>

        {ws.error && (
          <div style={{ color: "#f99", padding: "4px 0" }}>{ws.error}</div>
        )}

        <div className="button-row">
          <button className="btn" onClick={() => onNavigate("online")}>
            Back
          </button>
        </div>
      </div>
    </Window>
  );
}
