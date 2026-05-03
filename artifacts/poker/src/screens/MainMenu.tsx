import type { Screen } from "@/App";
import type { AccountProfile } from "@/lib/account";
import { nameColorValue, titleLabel } from "@/lib/cosmetics";

interface Props {
  onNavigate: (s: Screen) => void;
  playerName: string;
  bank: number;
  account: AccountProfile | null;
}

export function MainMenu({ onNavigate, playerName, bank, account }: Props) {
  void playerName;
  const hasAccount = account !== null;
  const hasMoney = bank > 0;
  const canPlayOnline = hasAccount && hasMoney;
  const onlineHint = !hasAccount
    ? "Create an account in Settings to enable Online play"
    : !hasMoney
      ? "Your bank is empty. Play Single Player or grab the daily chips in the Shop."
      : "";
  const title = account ? titleLabel(account.equipped) : null;
  const color = account ? nameColorValue(account.equipped) : "#ffffff";

  return (
    <div className="panel menu-window">
      <h1 className="title-text">POKER</h1>
      <div className="subtitle">A GAME OF CARDS</div>
      {account && (
        <div
          style={{
            textAlign: "center",
            marginTop: 6,
            fontSize: 13,
          }}
        >
          Welcome,{" "}
          <strong style={{ color, textShadow: "0 0 1px rgba(0,0,0,0.7)" }}>
            {title ? `${title} ` : ""}
            {account.username}
          </strong>
        </div>
      )}
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
          onClick={() => {
            onNavigate("online-connecting");
            setTimeout(() => onNavigate("online"), 600);
          }}
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
