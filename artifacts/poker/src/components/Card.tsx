import type { Card as CardType } from "@/lib/cards";
import { RANK_NAMES, SUIT_SYMBOLS, isRedSuit } from "@/lib/cards";

interface Props {
  card?: CardType;
  hidden?: boolean;
  small?: boolean;
  onClick?: () => void;
  marked?: boolean;
}

export function PlayingCard({ card, hidden, small, onClick, marked }: Props) {
  const sizeCls = small ? "card small" : "card";
  if (hidden || !card) {
    return (
      <div
        className={`${sizeCls} back ${marked ? "discard" : ""} ${onClick ? "draw-card-toggle" : ""}`}
        onClick={onClick}
      >
        &nbsp;
      </div>
    );
  }
  const red = isRedSuit(card.suit);
  return (
    <div
      className={`${sizeCls} ${red ? "red" : ""} ${marked ? "discard draw-card-toggle" : ""} ${onClick ? "draw-card-toggle" : ""}`}
      onClick={onClick}
    >
      <div className="card-rank-top">
        <span>{RANK_NAMES[card.rank]}</span>
        <span>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
      <div className="card-suit-mid">{SUIT_SYMBOLS[card.suit]}</div>
      <div className="card-rank-bottom">
        <span>{RANK_NAMES[card.rank]}</span>
        <span>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );
}
