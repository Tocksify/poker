import type { Screen } from "@/App";
import { Window } from "@/components/Window";

interface Props {
  onNavigate: (s: Screen) => void;
}

export function Online({ onNavigate }: Props) {
  return (
    <Window
      title="Online Play"
      className="online-window"
      onClose={() => onNavigate("menu")}
    >
      <div style={{ padding: "12px 8px", textAlign: "center" }}>
        <div style={{ fontSize: 14, marginBottom: 12, fontWeight: "bold" }}>
          Online play is not available
        </div>
        <div style={{ marginBottom: 16 }} className="muted">
          A network connection to the matchmaking server could not be
          established. Please try again later.
        </div>
        <button className="btn" onClick={() => onNavigate("menu")}>
          OK
        </button>
      </div>
    </Window>
  );
}
