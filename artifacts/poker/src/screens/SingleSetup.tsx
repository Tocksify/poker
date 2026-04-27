import { useEffect, useState } from "react";
import type { Screen, GameSetup } from "@/App";
import { Window } from "@/components/Window";
import {
  STARTER_FREE_STACK_MULTIPLIER,
  getBank,
  subscribe,
  withdrawFromBank,
} from "@/lib/bank";

interface Props {
  onNavigate: (s: Screen) => void;
  playerName: string;
  onStart: (setup: GameSetup) => void;
}

const BOT_NAMES = [
  "Lucky",
  "Doc",
  "Slim",
  "Maverick",
  "Riggs",
  "Vegas",
  "Diamond",
  "Ace",
];

export function SingleSetup({ onNavigate, playerName, onStart }: Props) {
  const [bank, setBank] = useState(() => getBank());
  const [style, setStyle] = useState<"holdem" | "draw">("holdem");
  const [numBots, setNumBots] = useState(3);
  const [smallBlind, setSmallBlind] = useState(10);
  const [ante, setAnte] = useState(5);
  const [withdrawAmt, setWithdrawAmt] = useState(0);

  useEffect(() => {
    const unsub = subscribe(() => setBank(getBank()));
    return unsub;
  }, []);

  const bigBlind = smallBlind * 2;
  const isBroke = bank <= 0;
  const freeStarterStack = smallBlind * STARTER_FREE_STACK_MULTIPLIER;

  // Defaults: when bank changes, default withdraw to either full bank (if small)
  // or a sensible 50 * BB
  useEffect(() => {
    if (bank <= 0) {
      setWithdrawAmt(0);
      return;
    }
    const suggested = Math.min(bank, Math.max(50 * bigBlind, smallBlind * 20));
    setWithdrawAmt(suggested);
  }, [bank, bigBlind, smallBlind]);

  function handleStart() {
    const startingChips = isBroke
      ? freeStarterStack
      : Math.max(bigBlind, Math.min(bank, Math.floor(withdrawAmt) || 0));
    if (!isBroke) {
      withdrawFromBank(startingChips);
    }
    const players = [
      { name: playerName || "Player", isHuman: true },
      ...BOT_NAMES.slice(0, numBots).map((n) => ({ name: n, isHuman: false })),
    ];
    onStart({
      style,
      players,
      startingChips,
      smallBlind,
      bigBlind,
      ante,
      isFreeStarter: isBroke,
    });
  }

  const startDisabled = !isBroke && (withdrawAmt < bigBlind || withdrawAmt > bank);

  return (
    <Window
      title="New Single Player Game"
      className="setup-window"
      onClose={() => onNavigate("menu")}
    >
      <fieldset className="fieldset">
        <legend>Poker Style</legend>
        <div style={{ marginBottom: 4 }}>
          <input
            type="radio"
            id="style-holdem"
            checked={style === "holdem"}
            onChange={() => setStyle("holdem")}
          />
          <label htmlFor="style-holdem" style={{ marginLeft: 4 }}>
            <strong>Texas Hold'em</strong> &mdash; 2 hole cards + 5 community.
          </label>
        </div>
        <div>
          <input
            type="radio"
            id="style-draw"
            checked={style === "draw"}
            onChange={() => setStyle("draw")}
          />
          <label htmlFor="style-draw" style={{ marginLeft: 4 }}>
            <strong>Five Card Draw</strong> &mdash; 5 cards each, one draw.
          </label>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Opponents</legend>
        <div className="form-row">
          <label htmlFor="num-bots">Number of Bots:</label>
          <div className="range-row">
            <input
              id="num-bots"
              type="range"
              min={1}
              max={7}
              value={numBots}
              onChange={(e) => setNumBots(Number(e.target.value))}
            />
            <span style={{ minWidth: 24, textAlign: "right" }}>{numBots}</span>
          </div>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Stakes</legend>
        <div className="form-row">
          <label htmlFor="sb">Small Blind:</label>
          <select
            id="sb"
            className="select"
            value={smallBlind}
            onChange={(e) => setSmallBlind(Number(e.target.value))}
          >
            <option value={5}>5 (BB 10)</option>
            <option value={10}>10 (BB 20)</option>
            <option value={25}>25 (BB 50)</option>
            <option value={50}>50 (BB 100)</option>
            <option value={100}>100 (BB 200)</option>
          </select>
        </div>
        {style === "draw" && (
          <div className="form-row">
            <label htmlFor="ante">Ante:</label>
            <select
              id="ante"
              className="select"
              value={ante}
              onChange={(e) => setAnte(Number(e.target.value))}
            >
              <option value={0}>None</option>
              <option value={1}>1</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
          </div>
        )}
      </fieldset>

      <fieldset className="fieldset">
        <legend>Buy In From Bank</legend>
        <div className="form-row">
          <label>Bank Balance:</label>
          <strong>{bank.toLocaleString()}</strong>
        </div>
        {isBroke ? (
          <div
            className="muted"
            style={{ fontSize: 12, padding: "4px 0", lineHeight: 1.4 }}
          >
            Your bank is empty. You'll get a free starter stack of{" "}
            <strong>{freeStarterStack}</strong> chips
            ({STARTER_FREE_STACK_MULTIPLIER}× the small blind). Win some chips
            and deposit to your bank between rounds.
          </div>
        ) : (
          <>
            <div className="form-row">
              <label htmlFor="withdraw">Withdraw to Table:</label>
              <div className="range-row">
                <input
                  id="withdraw"
                  type="range"
                  min={Math.min(bigBlind, bank)}
                  max={bank}
                  step={Math.max(1, Math.floor(bank / 100))}
                  value={withdrawAmt}
                  onChange={(e) => setWithdrawAmt(Number(e.target.value))}
                />
                <input
                  type="number"
                  className="input"
                  style={{ width: 90 }}
                  min={bigBlind}
                  max={bank}
                  value={withdrawAmt}
                  onChange={(e) => setWithdrawAmt(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              Min {bigBlind} (one big blind). Bots also start with{" "}
              {withdrawAmt.toLocaleString()} chips. Remaining chips at game end
              are deposited back to your bank.
            </div>
          </>
        )}
      </fieldset>

      <div className="button-row">
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={startDisabled}
        >
          {isBroke ? "Play Free Starter" : "Deal!"}
        </button>
        <button className="btn" onClick={() => onNavigate("menu")}>
          Cancel
        </button>
      </div>
    </Window>
  );
}
