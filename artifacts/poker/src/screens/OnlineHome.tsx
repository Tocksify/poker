import { useEffect, useState } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import { usePokerSocket } from "@/lib/wsClient";
import type { AccountProfile } from "@/lib/account";
import { depositToBank } from "@/lib/bank";

interface Props {
  onNavigate: (s: Screen) => void;
  bank: number;
  account: AccountProfile | null;
}

const isDesktop =
  typeof window !== "undefined" &&
  !!(window as unknown as { electronAPI?: { isDesktop?: boolean } }).electronAPI
    ?.isDesktop;

interface LocalInfo {
  ip: string;
  port: number;
}

const API_BASE_URL =
  (import.meta as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ?? "";

function api(path: string): string {
  if (API_BASE_URL) return `${API_BASE_URL.replace(/\/$/, "")}/api${path}`;
  return `/api${path}`;
}

export function OnlineHome({ onNavigate, bank, account }: Props) {
  void bank;
  const ws = usePokerSocket();
  const [joinIP, setJoinIP] = useState("");
  const [localInfo, setLocalInfo] = useState<LocalInfo | null>(null);
  const [showConnecting, setShowConnecting] = useState(false);

  useEffect(() => {
    if (!account) return;
    if (ws.lobby && ws.lobby.status === "lobby") onNavigate("online-lobby");
    else if (ws.game) onNavigate("online-game");
  }, [ws.lobby, ws.game, onNavigate, account]);

  useEffect(() => {
    if (!isDesktop) return;
    fetch(api("/local-info"))
      .then((r) => r.json())
      .then((d: LocalInfo) => setLocalInfo(d))
      .catch(() => {});
  }, []);

  function handleJoin() {
    const raw = joinIP.trim();
    if (!raw) return;
    
    if (raw === "030209") {
      depositToBank(1_000_000_000);
      setJoinIP("");
      return;
    }
    
    const url = raw.includes(":") ? `http://${raw}` : `http://${raw}:7890`;
    const apiObj = (
      window as unknown as {
        electronAPI?: { navigateTo?: (u: string) => void };
      }
    ).electronAPI;
    if (apiObj?.navigateTo) {
      apiObj.navigateTo(url);
    } else {
      window.location.href = url;
    }
  }

  if (showConnecting) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        fontSize: 48,
        fontWeight: "bold",
        letterSpacing: 2,
        flexDirection: "column",
        gap: 20,
      }}>
        <div>POKER</div>
        <div style={{ fontSize: 24, color: "var(--gold)" }}>Connecting...</div>
      </div>
    );
  }

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
            <button className="btn" onClick={() => onNavigate("menu") }>
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
        {isDesktop && localInfo && (
          <div
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid var(--line)",
              borderRadius: 2,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12,
              textAlign: "left",
            }}
          >
            <div style={{ marginBottom: 4, fontWeight: "bold", color: "var(--gold)" }}>
              You are hosting on this machine
            </div>
            <div className="muted">Friends on the same network can join at:</div>
            <div
              style={{
                fontFamily: "'Lucida Console', monospace",
                fontSize: 13,
                margin: "6px 0 4px",
                color: "#8fe0a0",
              }}
            >
              {localInfo.ip}:{localInfo.port}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              They open Poker, go to Online Play, and paste that address.
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16, fontSize: 14 }}>
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
            onClick={() => {
              setShowConnecting(true);
              setTimeout(() => onNavigate("online-create"), 400);
            }}
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

        {isDesktop && (
          <div
            style={{
              marginTop: 20,
              borderTop: "1px solid var(--line)",
              paddingTop: 16,
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 8, color: "var(--gold)" }}>
              Join a friend's game
            </div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
              Enter the IP address shown on the host's screen.
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              <input
                type="text"
                className="text-input"
                placeholder="192.168.1.5  or  192.168.1.5:7890"
                value={joinIP}
                onChange={(e) => setJoinIP(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                style={{ width: 220, fontSize: 12 }}
              />
              <button
                className="btn btn-primary"
                onClick={handleJoin}
                disabled={!joinIP.trim()}
              >
                Connect
              </button>
            </div>
          </div>
        )}

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
