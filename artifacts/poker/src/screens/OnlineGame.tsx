import { useEffect, useState } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import { PlayingCard } from "@/components/Card";
import { usePokerSocket } from "@/lib/wsClient";
import type { GameView, ViewPlayer } from "@/lib/protocol";
import { withdrawFromBank } from "@/lib/bank";

interface Props {
  onNavigate: (s: Screen) => void;
  bank: number;
}

export function OnlineGame({ onNavigate, bank }: Props) {
  const ws = usePokerSocket();
  const gv = ws.game;
  const [showQuit, setShowQuit] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [discardSet, setDiscardSet] = useState<Set<number>>(new Set());
  const [depositAmt, setDepositAmt] = useState(0);
  const [midJoinBuyIn, setMidJoinBuyIn] = useState(0);
  const [midJoinSent, setMidJoinSent] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ws.game && !ws.lobby) {
      onNavigate("online");
    }
  }, [ws.game, ws.lobby, onNavigate]);

  useEffect(() => {
    if (!ws.game && ws.lobby && ws.lobby.status === "lobby") {
      onNavigate("online-lobby");
    }
  }, [ws.game, ws.lobby, onNavigate]);

  useEffect(() => {
    if (gv?.legal?.canRaise) {
      const minTo = gv.legal.minRaiseTo;
      const maxTo = gv.legal.maxRaiseTo;
      setRaiseAmount(Math.min(minTo, maxTo));
    }
  }, [gv?.legal, gv?.toActId, gv?.stage]);

  useEffect(() => {
    if (gv?.canDrawNow) {
      setDiscardSet(new Set());
    }
  }, [gv?.canDrawNow, gv?.handNumber]);

  // Reset deposit input each new hand
  useEffect(() => {
    setDepositAmt(0);
  }, [gv?.handNumber]);

  // Tick for countdowns
  useEffect(() => {
    if (!gv?.depositDeadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [gv?.depositDeadline]);

  // Initialize mid-game buy-in default
  useEffect(() => {
    if (!gv) return;
    const me = gv.players.find((p) => p.id === gv.yourId);
    if (!me) {
      const suggested = Math.min(bank, gv.config.startingChips || gv.config.bigBlind * 50);
      setMidJoinBuyIn(suggested);
    } else {
      setMidJoinSent(false);
    }
  }, [gv?.yourId, gv?.players.length, bank]);

  if (!gv) {
    return (
      <Window
        title="Online Game"
        className="game-window"
        onClose={() => setShowQuit(true)}
      >
        <div className="muted" style={{ padding: 16 }}>
          Loading game...
        </div>
      </Window>
    );
  }

  const me = gv.players.find((p) => p.id === gv.yourId);
  const toActPlayer = gv.players.find((p) => p.id === gv.toActId);
  const isYourTurn = gv.toActId === gv.yourId && !gv.isHandOver;
  const isHost = gv.hostId === gv.yourId;
  const titleGameName =
    gv.gameType === "holdem" ? "Texas Hold'em" : "Five Card Draw";
  const depositRemainingMs = gv.depositDeadline
    ? Math.max(0, gv.depositDeadline - now)
    : 0;
  const depositWindowOpen =
    gv.depositDeadline != null &&
    depositRemainingMs > 0 &&
    !gv.yourDepositSubmitted &&
    me != null &&
    me.chips > 0;

  const isMidGameJoiner = me == null;

  function toggleDiscard(idx: number) {
    setDiscardSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function confirmDraw() {
    ws.send({
      type: "action",
      payload: { kind: "draw", discardIdxs: Array.from(discardSet).sort() },
    });
  }

  function quitToMenu() {
    ws.send({ type: "leave" });
    onNavigate("menu");
  }

  function submitDeposit(amount: number) {
    const amt = Math.max(0, Math.floor(amount || 0));
    ws.send({ type: "deposit", payload: { amount: amt } });
  }

  function submitMidJoinBuyIn() {
    if (!gv) return;
    const bb = gv.config.bigBlind;
    const amt = Math.max(bb, Math.min(bank, Math.floor(midJoinBuyIn) || 0));
    withdrawFromBank(amt);
    ws.send({ type: "buyIn", payload: { amount: amt } });
    setMidJoinSent(true);
  }

  return (
    <Window
      title={`${titleGameName} — Hand #${gv.handNumber}`}
      className="game-window"
      onClose={() => setShowQuit(true)}
    >
      <div className="felt">
        <div className="players-row">
          {gv.players.map((p) => (
            <PlayerSeat
              key={p.id}
              player={p}
              isToAct={p.id === gv.toActId && !gv.isHandOver}
              isDealer={p.id === gv.dealerId}
              isYou={p.id === gv.yourId}
              gameType={gv.gameType}
            />
          ))}
        </div>

        <div className="community-area">
          <div className="pot-display">
            Pot: {gv.pot.toLocaleString()}
            {gv.config.ante > 0 && (
              <span style={{ marginLeft: 12, fontSize: 11 }}>
                · Ante {gv.config.ante}
              </span>
            )}
          </div>

          {gv.gameType === "holdem" && (
            <div className="cards-row">
              {[0, 1, 2, 3, 4].map((i) =>
                gv.community?.[i] ? (
                  <PlayingCard key={i} card={gv.community[i]!} />
                ) : (
                  <div key={i} className="card placeholder">
                    &nbsp;
                  </div>
                ),
              )}
            </div>
          )}

          {gv.gameType === "draw" && me && me.hand && (
            <YourHand
              hand={me.hand}
              canPickDiscards={gv.canDrawNow && !me.hasDrawn}
              discardSet={discardSet}
              onToggle={toggleDiscard}
            />
          )}

          {gv.isHandOver && gv.lastWinners.length > 0 && (
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
              {gv.lastWinners.map((w) => w.name).join(", ")} wins{" "}
              {gv.lastWinners[0].amount.toLocaleString()}
              {" — "}
              {gv.lastWinners[0].reason}
            </div>
          )}

          {depositWindowOpen && me && (
            <div
              style={{
                background: "var(--panel-strong)",
                border: "1px solid var(--accent)",
                padding: "8px 12px",
                borderRadius: 4,
                marginTop: 6,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <strong>Deposit to Bank?</strong>
                <span style={{ fontFamily: "Lucida Console, monospace" }}>
                  {Math.ceil(depositRemainingMs / 1000)}s
                </span>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                Move some of your {me.chips.toLocaleString()} chips into your
                bank.
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="range"
                  min={0}
                  max={me.chips}
                  step={Math.max(1, Math.floor(me.chips / 100))}
                  value={depositAmt}
                  onChange={(e) => setDepositAmt(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  className="input"
                  style={{ width: 80 }}
                  min={0}
                  max={me.chips}
                  value={depositAmt}
                  onChange={(e) => setDepositAmt(Number(e.target.value))}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => submitDeposit(depositAmt)}
                >
                  Deposit
                </button>
                <button className="btn" onClick={() => submitDeposit(0)}>
                  Skip
                </button>
              </div>
            </div>
          )}

          {gv.pendingJoinsCount > 0 && (
            <div
              className="muted"
              style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}
            >
              {gv.pendingJoinsCount} player(s) waiting to be seated next hand
            </div>
          )}
        </div>
      </div>

      <div className="controls-bar">
        <div className="log-area">
          {gv.log.slice(-12).map((l, i) => (
            <div className="log-line" key={i}>
              {l}
            </div>
          ))}
        </div>

        {ws.error && (
          <div style={{ color: "#f99", fontSize: 11 }}>{ws.error}</div>
        )}

        {gv.isGameOver ? (
          <div className="control-buttons">
            <div style={{ flex: 1, fontWeight: "bold" }}>
              {me?.status === "out"
                ? "You're out of chips. Game over."
                : "Game over!"}
            </div>
            <button className="btn" onClick={quitToMenu}>
              Main Menu
            </button>
          </div>
        ) : gv.isHandOver ? (
          <div className="control-buttons">
            <div style={{ flex: 1 }}>
              {gv.depositDeadline
                ? `Deposit window: ${Math.ceil(depositRemainingMs / 1000)}s`
                : "Hand complete."}
            </div>
            {isHost && (
              <button
                className="btn btn-primary"
                disabled={depositRemainingMs > 0}
                onClick={() => ws.send({ type: "nextHand" })}
                title={
                  depositRemainingMs > 0
                    ? `Wait ${Math.ceil(depositRemainingMs / 1000)}s for deposit window`
                    : ""
                }
              >
                Deal Next Hand
              </button>
            )}
            {!isHost && (
              <div className="dim">Waiting for host to deal next hand...</div>
            )}
            <button className="btn" onClick={() => setShowQuit(true)}>
              Quit
            </button>
          </div>
        ) : isYourTurn && gv.canDrawNow && me ? (
          <div className="control-buttons">
            <div style={{ fontSize: 12, marginRight: 8 }}>
              Click cards to mark for discard ({discardSet.size} selected)
            </div>
            <button className="btn btn-primary" onClick={confirmDraw}>
              {discardSet.size === 0
                ? "Stand Pat"
                : `Discard ${discardSet.size} & Draw`}
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={() => setShowQuit(true)}>
              Quit
            </button>
          </div>
        ) : isYourTurn && gv.legal && me ? (
          <BetControls
            legal={gv.legal}
            myBet={me.bet}
            raiseAmount={raiseAmount}
            setRaiseAmount={setRaiseAmount}
            onAction={(msg) => ws.send(msg)}
            onQuit={() => setShowQuit(true)}
          />
        ) : (
          <div className="control-buttons">
            <div style={{ flex: 1 }}>
              {isMidGameJoiner
                ? "You'll be seated next hand."
                : gv.canDrawNow && toActPlayer
                  ? `${toActPlayer.name} is choosing cards to draw...`
                  : `Waiting for ${toActPlayer?.name ?? "..."}`}
            </div>
            <button className="btn" onClick={() => setShowQuit(true)}>
              Quit
            </button>
          </div>
        )}
      </div>

      {/* Mid-game buy-in dialog */}
      {isMidGameJoiner && !midJoinSent && (
        <div className="dialog-overlay">
          <div className="dialog" style={{ maxWidth: 420 }}>
            <div className="panel-header">
              <div className="panel-title">Buy In to Join</div>
            </div>
            <div className="dialog-body">
              <p style={{ marginBottom: 8 }}>
                You're joining a game in progress. Choose your buy-in. You'll
                be dealt in at the next hand.
              </p>
              <div style={{ fontSize: 12, marginBottom: 8 }}>
                Bank: <strong>{bank.toLocaleString()}</strong> · Min{" "}
                {gv.config.bigBlind} (one big blind)
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="range"
                  min={Math.min(gv.config.bigBlind, bank)}
                  max={bank}
                  step={Math.max(1, Math.floor(bank / 100))}
                  value={midJoinBuyIn}
                  onChange={(e) => setMidJoinBuyIn(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  className="input"
                  style={{ width: 90 }}
                  min={gv.config.bigBlind}
                  max={bank}
                  value={midJoinBuyIn}
                  onChange={(e) => setMidJoinBuyIn(Number(e.target.value))}
                />
              </div>
              <div className="button-row">
                <button
                  className="btn btn-primary"
                  disabled={
                    midJoinBuyIn < gv.config.bigBlind || midJoinBuyIn > bank
                  }
                  onClick={submitMidJoinBuyIn}
                >
                  Buy In
                </button>
                <button className="btn" onClick={quitToMenu}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQuit && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="panel-header">
              <div className="panel-title">Leave Game?</div>
            </div>
            <div className="dialog-body">
              <p>
                Your remaining chips will be returned to your bank. If you just
                close the tab instead, those chips will be forfeit.
              </p>
              <div className="button-row">
                <button className="btn btn-danger" onClick={quitToMenu}>
                  Yes, Leave
                </button>
                <button className="btn" onClick={() => setShowQuit(false)}>
                  Stay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Window>
  );
}

function PlayerSeat({
  player,
  isToAct,
  isDealer,
  isYou,
  gameType,
}: {
  player: ViewPlayer;
  isToAct: boolean;
  isDealer: boolean;
  isYou: boolean;
  gameType: "holdem" | "draw";
}) {
  const cards = gameType === "holdem" ? player.hole : player.hand;
  const cardCount = gameType === "holdem" ? 2 : 5;
  const dimmed = player.disconnected;
  return (
    <div
      className={`player-card ${isToAct ? "active" : ""} ${
        player.status === "folded" ? "folded" : ""
      } ${isYou ? "me" : ""} ${dimmed ? "disconnected-seat" : ""}`}
    >
      <div className="player-name">
        {player.name}
        {isDealer && " (D)"}
        {isYou && " · You"}
        {player.isHost && (
          <span className="player-badge host" style={{ marginLeft: 4 }}>
            HOST
          </span>
        )}
        {player.pendingKick && (
          <span className="player-badge fold" style={{ marginLeft: 4 }}>
            KICK
          </span>
        )}
      </div>
      <div className="player-stats">
        Chips: {player.chips.toLocaleString()}
        {player.bet > 0 && ` · Bet: ${player.bet}`}
      </div>
      <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
        {cards == null
          ? Array.from({ length: cardCount }).map((_, i) => (
              <PlayingCard key={i} hidden small />
            ))
          : cards.length === 0
            ? null
            : cards.map((c, i) => <PlayingCard key={i} card={c} small />)}
      </div>
      {player.disconnected ? (
        <div className="player-action-tag fold">DISCONNECTED</div>
      ) : (
        <>
          {player.status === "folded" && (
            <div className="player-action-tag fold">FOLDED</div>
          )}
          {player.status === "allin" && (
            <div className="player-action-tag allin">ALL IN</div>
          )}
          {player.status === "out" && (
            <div className="player-action-tag fold">OUT</div>
          )}
        </>
      )}
      {gameType === "draw" &&
        player.hasDrawn &&
        player.drawnCount !== undefined && (
          <div className="player-action-tag">
            Drew {player.drawnCount}
          </div>
        )}
    </div>
  );
}

function YourHand({
  hand,
  canPickDiscards,
  discardSet,
  onToggle,
}: {
  hand: import("@/lib/cards").Card[];
  canPickDiscards: boolean;
  discardSet: Set<number>;
  onToggle: (idx: number) => void;
}) {
  return (
    <div className="draw-cards-area">
      {hand.map((c, i) => (
        <div
          key={i}
          className={`draw-card-toggle ${discardSet.has(i) ? "discard" : ""}`}
          onClick={() => canPickDiscards && onToggle(i)}
          style={{ cursor: canPickDiscards ? "pointer" : "default" }}
        >
          <PlayingCard card={c} />
        </div>
      ))}
    </div>
  );
}

function BetControls({
  legal,
  myBet,
  raiseAmount,
  setRaiseAmount,
  onAction,
  onQuit,
}: {
  legal: NonNullable<GameView["legal"]>;
  myBet: number;
  raiseAmount: number;
  setRaiseAmount: (n: number) => void;
  onAction: (
    msg:
      | { type: "action"; payload: { kind: "fold" } }
      | { type: "action"; payload: { kind: "check" } }
      | { type: "action"; payload: { kind: "call" } }
      | { type: "action"; payload: { kind: "bet"; amount: number } }
      | { type: "action"; payload: { kind: "raise"; toAmount: number } },
  ) => void;
  onQuit: () => void;
}) {
  return (
    <div className="control-buttons">
      <button
        className="btn"
        onClick={() => onAction({ type: "action", payload: { kind: "fold" } })}
      >
        Fold
      </button>
      {legal.canCheck ? (
        <button
          className="btn"
          onClick={() =>
            onAction({ type: "action", payload: { kind: "check" } })
          }
        >
          Check
        </button>
      ) : (
        <button
          className="btn"
          disabled={!legal.canCall}
          onClick={() =>
            onAction({ type: "action", payload: { kind: "call" } })
          }
        >
          Call {legal.callAmount}
        </button>
      )}
      {legal.canRaise && (
        <>
          <input
            className="input"
            type="number"
            style={{ width: 90 }}
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(Number(e.target.value))}
          />
          <button
            className="btn"
            onClick={() =>
              onAction(
                legal.canCheck
                  ? {
                      type: "action",
                      payload: {
                        kind: "bet",
                        amount: Math.max(0, raiseAmount - myBet),
                      },
                    }
                  : {
                      type: "action",
                      payload: { kind: "raise", toAmount: raiseAmount },
                    },
              )
            }
          >
            {legal.canCheck ? "Bet" : "Raise to"}
          </button>
          <button
            className="btn"
            onClick={() =>
              onAction({
                type: "action",
                payload: { kind: "raise", toAmount: legal.maxRaiseTo },
              })
            }
          >
            All In
          </button>
        </>
      )}
      <div style={{ flex: 1 }} />
      <button className="btn" onClick={onQuit}>
        Quit
      </button>
    </div>
  );
}
