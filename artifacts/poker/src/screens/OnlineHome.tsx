import { useEffect } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import { usePokerSocket } from "@/lib/wsClient";
import type { AccountProfile } from "@/lib/account";

interface Props {
  onNavigate: (s: Screen) => void;
  bank: number;
  account: AccountProfile | null;
}

export function OnlineHome({ onNavigate, bank, account }: Props) {
  void bank;
  const ws = usePokerSocket();

  useEffect(() => {
    if (!account) return;
    if (ws.lobby && ws.lobby.status === "lobby") onNavigate("online-lobby");
    else if (ws.game) onNavigate("online-game");
  }, [ws.lobby, ws.game, onNavigate, account]);

  if (!account) {
    return (
      <Window
        title="Online Play"
        className="online-window"
        onClose={() => onNavigate("menu")}
      >
        <div style={{ padding: "16px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            Online play requires an account.
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
            Your bank, owned items, and equipped cosmetics are saved to your
            account so you can play from anywhere.
          </div>
          <button
            className="btn btn-primary btn-big"
            onClick={() => onNavigate("settings")}
          >
            Go to Settings
          </button>
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => onNavigate("menu")}>
              Back
            </button>
          </div>
        </div>
      </Window>
    );
  }

  const status = ws.status;
  const isReady = status === "open";

  return (
    <Window
      title="Online Play"
      className="online-window"
      onClose={() => onNavigate("menu")}
    >
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ marginBottom: 18, fontSize: 14 }}>
          Play with friends or family. Create a room to host a table, or join
          one with an invite code.
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
          }}
        >
          <button
            className="btn btn-big btn-primary"
            disabled={!isReady}
            onClick={() => onNavigate("online-create")}
          >
            Create Room
          </button>
          <button
            className="btn btn-big"
            disabled={!isReady}
            onClick={() => onNavigate("online-join")}
          >
            Join with Invite Code
          </button>
        </div>

        <div className="dim" style={{ marginTop: 16, fontSize: 11 }}>
          {status === "connecting" && "Connecting to server..."}
          {status === "open" && `Connected as ${account.username}.`}
          {status === "closed" && (
            <button className="btn" onClick={ws.reconnect}>
              Reconnect
            </button>
          )}
          {status === "error" && (
            <>
              <div style={{ color: "#f99", marginBottom: 6 }}>
                {ws.error ?? "Connection error"}
              </div>
              <button className="btn" onClick={ws.reconnect}>
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </Window>
  );
}
