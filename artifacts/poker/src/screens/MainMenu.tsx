import type { Screen } from "@/App";

interface Props {
  onNavigate: (s: Screen) => void;
  playerName: string;
}

export function MainMenu({ onNavigate, playerName }: Props) {
  const hasName = playerName.trim().length > 0;
  return (
    <div className="panel menu-window">
      <h1 className="title-text">POKER</h1>
      <div className="subtitle">A GAME OF CARDS</div>
      <div className="menu-buttons">
        <button
          className="btn btn-big btn-primary"
          onClick={() => onNavigate("setup")}
        >
          Single Player
        </button>
        <button
          className="btn btn-big"
          disabled={!hasName}
          onClick={() => onNavigate("online")}
          title={!hasName ? "Set a player name in Settings to play online" : ""}
        >
          Online
        </button>
        <button className="btn btn-big" onClick={() => onNavigate("settings")}>
          Settings
        </button>
        {!hasName && (
          <div className="menu-hint">
            Set a player name in Settings to enable Online play
          </div>
        )}
      </div>
    </div>
  );
}
