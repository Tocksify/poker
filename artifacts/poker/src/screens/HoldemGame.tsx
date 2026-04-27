import { useEffect, useMemo, useRef, useState } from "react";
import type { Screen, GameSetup } from "@/App";
import { Window } from "@/components/Window";
import { PlayingCard } from "@/components/Card";
import {
  Action,
  HoldemConfig,
  HoldemState,
  applyAction,
  botDecide,
  createHoldemState,
  gameOver,
  isHandOver,
  legalActions,
  startHand,
} from "@/lib/holdem";
import { bestHandFromN, handCategoryName } from "@/lib/cards";

interface Props {
  setup: GameSetup;
  fastBots: boolean;
  showHints: boolean;
  onExit: (s: Screen) => void;
}

export function HoldemGame({ setup, fastBots, showHints, onExit }: Props) {
  const initial = useMemo<HoldemConfig>(
    () => ({
      players: setup.players,
      startingChips: setup.startingChips,
      smallBlind: setup.smallBlind,
      bigBlind: setup.bigBlind,
    }),
    [setup],
  );

  const [state, setState] = useState<HoldemState>(() =>
    createHoldemState(initial),
  );
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showQuit, setShowQuit] = useState(false);
  const lastBotTickRef = useRef(0);

  const human = state.players.find((p) => p.isHuman)!;
  const turnPlayer = state.players[state.toActIdx];
  const isHumanTurn =
    turnPlayer?.isHuman && turnPlayer.status === "active" && !isHandOver(state);

  // Bot ticker
  useEffect(() => {
    if (isHandOver(state)) return;
    if (turnPlayer?.isHuman) return;
    if (turnPlayer?.status !== "active") return;
    const delay = fastBots ? 200 : 700 + Math.floor(Math.random() * 600);
    const id = window.setTimeout(() => {
      lastBotTickRef.current += 1;
      const next = { ...state };
      const action = botDecide(next);
      applyAction(next, action);
      setState({ ...next });
    }, delay);
    return () => window.clearTimeout(id);
  }, [state, fastBots, turnPlayer]);

  // Reset raise slider when turn changes
  useEffect(() => {
    if (isHumanTurn) {
      const legal = legalActions(state);
      setRaiseAmount(Math.min(legal.minRaiseTo, legal.maxRaiseTo));
    }
  }, [isHumanTurn, state.toActIdx, state.stage]);

  function doAction(a: Action) {
    const next = { ...state };
    applyAction(next, a);
    setState({ ...next });
  }

  function nextHand() {
    const next = { ...state };
    startHand(next);
    setState({ ...next });
  }

  const legal = isHumanTurn ? legalActions(state) : null;

  const humanBestHint = useMemo(() => {
    if (!showHints) return null;
    if (human.hole.length < 2) return null;
    if (state.community.length === 0) return null;
    const score = bestHandFromN([...human.hole, ...state.community]);
    return handCategoryName(score[0]);
  }, [human, state.community, showHints]);

  const lastWinnerNames = state.lastWinners.map((w) => w.name).join(", ");
  const isGameOver = gameOver(state);

  return (
    <Window
      title={`Texas Hold'em — Hand #${state.handNumber}`}
      className="game-window"
      onClose={() => setShowQuit(true)}
    >
      <div className="felt">
        <div className="players-row">
          {state.players.map((p, idx) => {
            const isToAct =
              idx === state.toActIdx && p.status === "active" && !isHandOver(state);
            const showCards =
              p.isHuman || (isHandOver(state) && p.status !== "folded" && p.status !== "out");
            return (
              <div
                key={p.id}
                className={`player-card ${isToAct ? "active" : ""} ${p.status === "folded" ? "folded" : ""}`}
              >
                <div className="player-name">
                  {p.name}
                  {idx === state.dealerIdx && " (D)"}
                </div>
                <div className="player-stats">
                  Chips: {p.chips} {p.bet > 0 ? `· Bet: ${p.bet}` : ""}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 3,
                    justifyContent: "center",
                  }}
                >
                  {p.hole.length === 0 ? null : showCards ? (
                    p.hole.map((c, i) => (
                      <PlayingCard key={i} card={c} small />
                    ))
                  ) : (
                    p.hole.map((_, i) => <PlayingCard key={i} hidden small />)
                  )}
                </div>
                {p.status === "folded" && (
                  <div className="player-action-tag fold">FOLDED</div>
                )}
                {p.status === "allin" && (
                  <div className="player-action-tag allin">ALL IN</div>
                )}
                {p.status === "out" && (
                  <div className="player-action-tag fold">OUT</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="community-area">
          <div className="pot-display">Pot: {state.pot}</div>
          <div className="cards-row">
            {[0, 1, 2, 3, 4].map((i) =>
              state.community[i] ? (
                <PlayingCard key={i} card={state.community[i]} />
              ) : (
                <div
                  key={i}
                  className="card"
                  style={{ background: "transparent", borderStyle: "dashed", color: "transparent" }}
                >
                  &nbsp;
                </div>
              ),
            )}
          </div>
          {humanBestHint && (
            <div style={{ fontSize: 12, color: "#ffd" }}>
              Your best so far: <strong>{humanBestHint}</strong>
            </div>
          )}
          {isHandOver(state) && state.lastWinners.length > 0 && (
            <div
              style={{
                background: "#ffe",
                color: "#000",
                padding: "6px 12px",
                border: "1px solid #000",
              }}
            >
              {lastWinnerNames} wins {state.lastWinners[0].amount} —{" "}
              {state.lastWinners[0].reason}
            </div>
          )}
        </div>
      </div>

      <div className="controls-bar">
        <div className="log-area">
          {state.log.slice(-12).map((l, i) => (
            <div className="log-line" key={i}>
              {l}
            </div>
          ))}
        </div>

        {isGameOver ? (
          <div className="control-buttons">
            <div style={{ flex: 1, fontWeight: "bold" }}>
              {human.status === "out"
                ? "You're out of chips. Game over."
                : "Game over — you are the last player standing!"}
            </div>
            <button className="btn" onClick={() => onExit("setup")}>
              New Game
            </button>
            <button className="btn" onClick={() => onExit("menu")}>
              Main Menu
            </button>
          </div>
        ) : isHandOver(state) ? (
          <div className="control-buttons">
            <div style={{ flex: 1 }}>Hand complete.</div>
            <button className="btn" onClick={nextHand}>
              Next Hand
            </button>
            <button className="btn" onClick={() => setShowQuit(true)}>
              Quit
            </button>
          </div>
        ) : isHumanTurn && legal ? (
          <>
            <div className="control-buttons">
              <button
                className="btn"
                onClick={() => doAction({ type: "fold" })}
              >
                Fold
              </button>
              {legal.canCheck ? (
                <button
                  className="btn"
                  onClick={() => doAction({ type: "check" })}
                >
                  Check
                </button>
              ) : (
                <button
                  className="btn"
                  disabled={!legal.canCall}
                  onClick={() => doAction({ type: "call" })}
                >
                  Call {legal.callAmount}
                </button>
              )}
              {legal.canRaise && (
                <>
                  <input
                    className="input"
                    type="number"
                    style={{ width: 80 }}
                    min={legal.minRaiseTo}
                    max={legal.maxRaiseTo}
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Number(e.target.value))}
                  />
                  <button
                    className="btn"
                    onClick={() =>
                      doAction(
                        legal.canCheck
                          ? { type: "bet", amount: raiseAmount - human.bet }
                          : { type: "raise", toAmount: raiseAmount },
                      )
                    }
                  >
                    {legal.canCheck ? "Bet" : "Raise to"}
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      doAction({
                        type: "raise",
                        toAmount: legal.maxRaiseTo,
                      })
                    }
                  >
                    All In
                  </button>
                </>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={() => setShowQuit(true)}>
                Quit
              </button>
            </div>
          </>
        ) : (
          <div className="control-buttons">
            <div style={{ flex: 1 }}>
              Waiting for {turnPlayer?.name ?? "..."}
            </div>
            <button className="btn" onClick={() => setShowQuit(true)}>
              Quit
            </button>
          </div>
        )}
      </div>

      {showQuit && (
        <div className="dialog-overlay">
          <div className="window dialog">
            <div className="title-bar">
              <div>Quit Game?</div>
            </div>
            <div className="dialog-body">
              <p>Are you sure you want to quit this game?</p>
              <div className="button-row">
                <button className="btn" onClick={() => onExit("menu")}>
                  Yes
                </button>
                <button className="btn" onClick={() => setShowQuit(false)}>
                  No
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Window>
  );
}
