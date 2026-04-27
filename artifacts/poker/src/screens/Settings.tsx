import { useState } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";

interface Settings {
  playerName: string;
  showCardHints: boolean;
  fastBots: boolean;
}

interface Props {
  onNavigate: (s: Screen) => void;
  settings: Settings;
  onSave: (s: Settings) => void;
}

export function SettingsScreen({ onNavigate, settings, onSave }: Props) {
  const [local, setLocal] = useState<Settings>(settings);

  return (
    <Window
      title="Settings"
      className="setup-window"
      onClose={() => onNavigate("menu")}
    >
      <fieldset className="fieldset">
        <legend>Player</legend>
        <div className="form-row">
          <label htmlFor="player-name">Player Name:</label>
          <input
            id="player-name"
            className="input"
            type="text"
            value={local.playerName}
            maxLength={24}
            onChange={(e) =>
              setLocal({ ...local, playerName: e.target.value })
            }
          />
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Gameplay</legend>
        <div className="form-row">
          <label htmlFor="show-hints">Show Hand Hints:</label>
          <div>
            <input
              id="show-hints"
              type="checkbox"
              checked={local.showCardHints}
              onChange={(e) =>
                setLocal({ ...local, showCardHints: e.target.checked })
              }
            />
            <span style={{ marginLeft: 6 }}>
              Show your current best hand at the table
            </span>
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="fast-bots">Fast Bots:</label>
          <div>
            <input
              id="fast-bots"
              type="checkbox"
              checked={local.fastBots}
              onChange={(e) =>
                setLocal({ ...local, fastBots: e.target.checked })
              }
            />
            <span style={{ marginLeft: 6 }}>
              Bots act with no thinking delay
            </span>
          </div>
        </div>
      </fieldset>

      <div className="button-row">
        <button
          className="btn"
          onClick={() => {
            onSave(local);
            onNavigate("menu");
          }}
        >
          OK
        </button>
        <button className="btn" onClick={() => onNavigate("menu")}>
          Cancel
        </button>
      </div>
    </Window>
  );
}
