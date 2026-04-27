import { useEffect, useState } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import { usePokerSocket } from "@/lib/wsClient";

interface Props {
  onNavigate: (s: Screen) => void;
  playerName: string;
}

export function CreateRoom({ onNavigate, playerName }: Props) {
  const ws = usePokerSocket();
  const [gameType, setGameType] = useState<"holdem" | "draw">("holdem");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [smallBlind, setSmallBlind] = useState(10);
  const [startingChips, setStartingChips] = useState(1000);
  const [ante, setAnte] = useState(5);
  const [fillBots, setFillBots] = useState(true);

  // When lobby state arrives, navigate to lobby
  useEffect(() => {
    if (ws.lobby && ws.lobby.status === "lobby") {
      onNavigate("online-lobby");
    }
  }, [ws.lobby, onNavigate]);

  function handleCreate() {
    ws.send({
      type: "create",
      payload: {
        name: playerName,
        config: {
          gameType,
          smallBlind,
          bigBlind: smallBlind * 2,
          ante: gameType === "draw" ? ante : 0,
          maxPlayers,
          fillBots,
          startingChips,
        },
      },
    });
  }

  return (
    <Window
      title="Create Room"
      className="setup-window"
      onClose={() => onNavigate("online")}
    >
      <fieldset className="fieldset">
        <legend>Poker Style</legend>
        <div style={{ marginBottom: 4 }}>
          <input
            type="radio"
            id="cr-holdem"
            checked={gameType === "holdem"}
            onChange={() => setGameType("holdem")}
          />
          <label htmlFor="cr-holdem" style={{ marginLeft: 6 }}>
            <strong>Texas Hold'em</strong>
          </label>
        </div>
        <div>
          <input
            type="radio"
            id="cr-draw"
            checked={gameType === "draw"}
            onChange={() => setGameType("draw")}
          />
          <label htmlFor="cr-draw" style={{ marginLeft: 6 }}>
            <strong>Five Card Draw</strong>
          </label>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Lobby</legend>
        <div className="form-row">
          <label htmlFor="cr-max">Max Players:</label>
          <div className="range-row">
            <input
              id="cr-max"
              type="range"
              min={2}
              max={8}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            />
            <span style={{ minWidth: 24, textAlign: "right" }}>
              {maxPlayers}
            </span>
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="cr-fill">Fill Empty Seats:</label>
          <div>
            <input
              id="cr-fill"
              type="checkbox"
              checked={fillBots}
              onChange={(e) => setFillBots(e.target.checked)}
            />
            <span style={{ marginLeft: 8 }}>
              If lobby isn't full when game starts, fill remaining seats with
              bots
            </span>
          </div>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Stakes</legend>
        <div className="form-row">
          <label htmlFor="cr-chips">Starting Chips:</label>
          <select
            id="cr-chips"
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
          <label htmlFor="cr-sb">Small Blind:</label>
          <select
            id="cr-sb"
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
        {gameType === "draw" && (
          <div className="form-row">
            <label htmlFor="cr-ante">Ante:</label>
            <select
              id="cr-ante"
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

      {ws.error && (
        <div style={{ color: "#f99", padding: "4px 0" }}>{ws.error}</div>
      )}

      <div className="button-row">
        <button
          className="btn btn-primary"
          disabled={ws.status !== "open"}
          onClick={handleCreate}
        >
          Create Room
        </button>
        <button className="btn" onClick={() => onNavigate("online")}>
          Cancel
        </button>
      </div>
    </Window>
  );
}
