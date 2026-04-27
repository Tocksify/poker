import type { Screen } from "@/App";

interface Props {
  onNavigate: (s: Screen) => void;
  playerName: string;
  bank: number;
}

export function MainMenu({ onNavigate, playerName, bank }: Props) {
  const hasName = playerName.trim().length > 0;
  const hasMoney = bank > 0;
  const canPlayOnline = hasName && hasMoney;
  const onlineHint = !hasName
    ? "Set a player name in Settings to enable Online play"
    : !hasMoney
      ? "Your bank is empty. Play Single Player or grab the daily chips in the Shop."
      : "";

  return (
    <div className="panel menu-window">
      <h1 className="title-text">POKER</h1>
      <div className="subtitle">A GAME OF CARDS</div>
      <div className="bank-display" title="Your in-game currency (bank)">
        Bank: <strong>{bank.toLocaleString()}</strong>
      </div>
      <div className="menu-buttons">
        <button
          className="btn btn-big btn-primary"
          onClick={() => onNavigate("setup")}
        >
          Single Player
        </button>
        <button
          className="btn btn-big"
          disabled={!canPlayOnline}
          onClick={() => onNavigate("online")}
          title={onlineHint}
        >
          Online
        </button>
        <button className="btn btn-big" onClick={() => onNavigate("shop")}>
          Shop
        </button>
        <button className="btn btn-big" onClick={() => onNavigate("settings")}>
          Settings
        </button>
        {!canPlayOnline && (
          <div className="menu-hint">{onlineHint}</div>
        )}
      </div>
    </div>
  );
}
