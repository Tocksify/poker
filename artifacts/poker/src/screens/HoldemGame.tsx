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
import { depositToBank } from "@/lib/bank";

interface Props {
  setup: GameSetup;
  fastBots: boolean;
  showHints: boolean;
  onExit: (s: Screen) => void;
}

const DEPOSIT_WINDOW_MS = 10_000;

function buildState(setup: GameSetup): HoldemState {
  const cfg: HoldemConfig = {
    players: setup.players,
    startingChips: setup.startingChips,
    smallBlind: setup.smallBlind,
    bigBlind: setup.bigBlind,
    ante: setup.ante,
  };
  return createHoldemState(cfg);
}

export function HoldemGame({ setup, fastBots, showHints, onExit }: Props) {
  const [state, setState] = useState<HoldemState>(() => buildState(setup));
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showQuit, setShowQuit] = useState(false);
  // Deposit window state (between hands)
  const [depositDeadline, setDepositDeadline] = useState<number | null>(null);
  const [depositResolved, setDepositResolved] = useState(false);
  const [depositInput, setDepositInput] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lastBotTickRef = useRef(0);

  const human = state.players.find((p) => p.isHuman)!;
  const turnPlayer = state.players[state.toActIdx];
  const handIsOver = isHandOver(state);
  const isHumanTurn =
    turnPlayer?.isHuman && turnPlayer.status === "active" && !handIsOver;
  const isGameOver = gameOver(state);

  // Bot ticker
  useEffect(() => {
    if (handIsOver) return;
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
  }, [state, fastBots, turnPlayer, handIsOver]);

  // Reset raise slider when turn changes
  useEffect(() => {
    if (isHumanTurn) {
      const legal = legalActions(state);
      setRaiseAmount(Math.min(legal.minRaiseTo, legal.maxRaiseTo));
    }
  }, [isHumanTurn, state.toActIdx, state.stage]);

  // Deposit window: open when a hand ends (and game isn't over)
  useEffect(() => {
    if (handIsOver && !isGameOver && !depositDeadline && !depositResolved) {
      setDepositDeadline(Date.now() + DEPOSIT_WINDOW_MS);
      setDepositInput(0);
    }
  }, [handIsOver, isGameOver, depositDeadline, depositResolved]);

  // Tick the countdown
  useEffect(() => {
    if (!depositDeadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [depositDeadline]);

  function doAction(a: Action) {
    const next = { ...state };
    applyAction(next, a);
    setState({ ...next });
  }

  function nextHand() {
    const next = { ...state };
    startHand(next);
    setState({ ...next });
    setDepositDeadline(null);
    setDepositResolved(false);
    setDepositInput(0);
  }

  function submitDeposit(amount: number) {
    const amt = Math.max(0, Math.min(human.chips, Math.floor(amount || 0)));
    if (amt > 0) {
      const next = { ...state };
      next.players = next.players.map((p) =>
        p.id === human.id ? { ...p, chips: p.chips - amt } : p,
      );
      setState(next);
      depositToBank(amt);
    }
    setDepositResolved(true);
  }

  function quitToMenu() {
    // Refund human's remaining chips to the bank
    if (human.chips > 0) depositToBank(human.chips);
    onExit("menu");
  }

  function newGame() {
    if (human.chips > 0) depositToBank(human.chips);
    onExit("setup");
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
  const remainingMs = depositDeadline ? Math.max(0, depositDeadline - now) : 0;
  const depositWindowOpen =
    depositDeadline != null && remainingMs > 0 && !depositResolved;
  const canDealNext =
    handIsOver &&
    !isGameOver &&
    (depositResolved ||
      (depositDeadline != null && remainingMs <= 0) ||
      human.chips <= 0);

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
              idx === state.toActIdx && p.status === "active" && !handIsOver;
            const showCards =
              p.isHuman ||
              (handIsOver && p.status !== "folded" && p.status !== "out");
            return (
              <div
                key={p.id}
                className={`player-card ${isToAct ? "active" : ""} ${
                  p.status === "folded" ? "folded" : ""
                }`}
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
                  style={{
                    background: "transparent",
                    borderStyle: "dashed",
                    color: "transparent",
                  }}
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
          {handIsOver && state.lastWinners.length > 0 && (
            <div
              style={{
                background: "var(--panel-strong)",
                color: "var(--accent)",
                padding: "6px 14px",
                border: "1px solid var(--accent)",
                borderRadius: 2,
                textAlign: "center",
                fontSize: 13,
              }}
            >
              {lastWinnerNames} wins {state.lastWinners[0].amount} —{" "}
              {state.lastWinners[0].reason}
            </div>
          )}

          {depositWindowOpen && human.chips > 0 && (
            <DepositPanel
              chips={human.chips}
              amount={depositInput}
              setAmount={setDepositInput}
              remainingMs={remainingMs}
              onSubmit={() => submitDeposit(depositInput)}
              onSkip={() => submitDeposit(0)}
            />
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
            <button className="btn" onClick={newGame}>
              New Game
            </button>
            <button className="btn" onClick={quitToMenu}>
              Main Menu
            </button>
          </div>
        ) : handIsOver ? (
          <div className="control-buttons">
            <div style={{ flex: 1 }}>Hand complete.</div>
            <button
              className="btn btn-primary"
              onClick={nextHand}
              disabled={!canDealNext}
              title={
                !canDealNext
                  ? `Deposit window: ${Math.ceil(remainingMs / 1000)}s`
                  : ""
              }
            >
              Next Hand
            </button>
            <button className="btn" onClick={() => setShowQuit(true)}>
              Quit
            </button>
          </div>
        ) : isHumanTurn && legal ? (
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
          <div className="dialog">
            <div className="panel-header">
              <div className="panel-title">Quit Game?</div>
            </div>
            <div className="dialog-body">
              <p>
                Your remaining {human.chips.toLocaleString()} chips will be
                deposited to your bank.
              </p>
              <div className="button-row">
                <button className="btn btn-danger" onClick={quitToMenu}>
                  Yes, Quit
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

function DepositPanel({
  chips,
  amount,
  setAmount,
  remainingMs,
  onSubmit,
  onSkip,
}: {
  chips: number;
  amount: number;
  setAmount: (n: number) => void;
  remainingMs: number;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <div className="deposit-overlay">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>Deposit to Bank?</strong>
        <span style={{ fontFamily: "Lucida Console, monospace" }}>
          {seconds}s
        </span>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        Move some of your {chips.toLocaleString()} chips into your bank.
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="range"
          min={0}
          max={chips}
          step={Math.max(1, Math.floor(chips / 100))}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          className="input"
          style={{ width: 80 }}
          min={0}
          max={chips}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button className="btn btn-primary" onClick={onSubmit}>
          Deposit
        </button>
        <button className="btn" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}
