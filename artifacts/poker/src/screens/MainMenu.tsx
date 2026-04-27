import type { Screen } from "@/App";
import { Window } from "@/components/Window";

interface Props {
  onNavigate: (s: Screen) => void;
}

export function MainMenu({ onNavigate }: Props) {
  return (
    <Window title="Poker" className="menu-window">
      <h1 className="title-text">POKER</h1>
      <div className="subtitle">A Game of Cards</div>
      <div className="menu-buttons">
        <button className="btn btn-big" onClick={() => onNavigate("setup")}>
          Single
        </button>
        <button className="btn btn-big" onClick={() => onNavigate("online")}>
          Online
        </button>
        <button className="btn btn-big" onClick={() => onNavigate("settings")}>
          Settings
        </button>
      </div>
    </Window>
  );
}
