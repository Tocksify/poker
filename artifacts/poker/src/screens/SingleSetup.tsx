import { useState } from "react";
import type { Screen, GameSetup } from "@/App";
import { Window } from "@/components/Window";

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
  const [style, setStyle] = useState<"holdem" | "draw">("holdem");
  const [numBots, setNumBots] = useState(3);
  const [startingChips, setStartingChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [ante, setAnte] = useState(5);

  const bigBlind = smallBlind * 2;

  function handleStart() {
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
    });
  }

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
            Best 5 of 7. Four betting rounds.
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
            <strong>Five Card Draw</strong> &mdash; 5 cards each, one draw,
            two betting rounds.
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
          <label htmlFor="chips">Starting Chips:</label>
          <select
            id="chips"
            className="select"
            value={startingChips}
            onChange={(e) => setStartingChips(Number(e.target.value))}
          >
            <option value={500}>500</option>
            <option value={1000}>1,000</option>
            <option value={2500}>2,500</option>
            <option value={5000}>5,000</option>
            <option value={10000}>10,000</option>
          </select>
        </div>
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

      <div className="button-row">
        <button className="btn" onClick={handleStart}>
          Deal!
        </button>
        <button className="btn" onClick={() => onNavigate("menu")}>
          Cancel
        </button>
      </div>
    </Window>
  );
}
