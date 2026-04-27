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

  function handleJoin() {
    const trimmed = code.trim().toUpperCase();
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
        <div className="muted" style={{ marginBottom: 12 }}>
          Enter the invite code your host shared with you.
        </div>
        <div className="form-row">
          <label htmlFor="jr-code">Invite Code:</label>
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
        </div>
        <div className="form-row">
          <label>Joining as:</label>
          <div>
            <strong>{playerName}</strong>
          </div>
        </div>

        {ws.error && (
          <div style={{ color: "#f99", padding: "4px 0" }}>{ws.error}</div>
        )}

        <div className="button-row">
          <button
            className="btn btn-primary"
            disabled={ws.status !== "open" || code.trim().length < 3}
            onClick={handleJoin}
          >
            Join
          </button>
          <button className="btn" onClick={() => onNavigate("online")}>
            Cancel
          </button>
        </div>
      </div>
    </Window>
  );
}
