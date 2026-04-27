import { useEffect, useState } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import {
  DAILY_CLAIM_AMOUNT,
  canClaimDaily,
  claimDaily,
  getBank,
  nextDailyAvailableAt,
  setBank,
  subscribe,
} from "@/lib/bank";

interface Props {
  onNavigate: (s: Screen) => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Ready!";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Shop({ onNavigate }: Props) {
  const [bank, setBankState] = useState(() => getBank());
  const [now, setNow] = useState(() => Date.now());
  const [confirmReset, setConfirmReset] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribe(() => setBankState(getBank()));
    return unsub;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dailyReady = canClaimDaily();
  const remainMs = nextDailyAvailableAt() - now;

  function handleClaim() {
    const r = claimDaily();
    if (r.ok) {
      setFlash(`+${r.amount} chips claimed!`);
      window.setTimeout(() => setFlash(null), 2000);
    }
  }

  function handleReset() {
    setBank(0);
    setConfirmReset(false);
    setFlash("Bank reset to 0");
    window.setTimeout(() => setFlash(null), 1500);
  }

  return (
    <Window
      title="Shop &amp; Bank"
      className="setup-window"
      onClose={() => onNavigate("menu")}
    >
      <fieldset className="fieldset">
        <legend>Your Bank</legend>
        <div className="shop-bank-line">
          <span className="muted">Balance:</span>
          <span className="bank-amount">{bank.toLocaleString()}</span>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Use chips to buy in to games. Win pots, deposit between rounds, repeat.
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Daily Free Chips</legend>
        <div className="shop-row">
          <div>
            <strong>+{DAILY_CLAIM_AMOUNT}</strong> chips
            <div className="muted" style={{ fontSize: 11 }}>
              Once every 24 hours.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {dailyReady ? (
              <button className="btn btn-primary" onClick={handleClaim}>
                Claim
              </button>
            ) : (
              <>
                <div className="muted" style={{ fontSize: 11 }}>
                  Next claim:
                </div>
                <div style={{ fontFamily: "Lucida Console, monospace" }}>
                  {formatCountdown(remainMs)}
                </div>
              </>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Free Starter</legend>
        <div className="muted" style={{ fontSize: 12 }}>
          If your bank ever hits 0, you can start a Single Player game with a
          small free stack to grind back. Online play requires chips in your
          bank.
        </div>
      </fieldset>

      {flash && (
        <div
          style={{
            color: "var(--accent)",
            textAlign: "center",
            padding: "4px 0",
            fontWeight: "bold",
          }}
        >
          {flash}
        </div>
      )}

      <div className="button-row">
        <button className="btn" onClick={() => onNavigate("menu")}>
          Back
        </button>
        <div style={{ flex: 1 }} />
        {confirmReset ? (
          <>
            <span style={{ alignSelf: "center", fontSize: 11 }}>
              Reset bank to 0?
            </span>
            <button className="btn btn-danger" onClick={handleReset}>
              Yes
            </button>
            <button className="btn" onClick={() => setConfirmReset(false)}>
              No
            </button>
          </>
        ) : (
          <button
            className="btn"
            onClick={() => setConfirmReset(true)}
            title="Reset bank to 0 (for testing)"
          >
            Reset Bank
          </button>
        )}
      </div>
    </Window>
  );
}
