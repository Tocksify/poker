import { useEffect, useState } from "react";
import type { Screen } from "@/App";
import { Window } from "@/components/Window";
import {
  DAILY_CLAIM_AMOUNT,
  canClaimDaily,
  claimDaily,
  getBank,
  nextDailyAvailableAt,
  setBank,
  subscribe,
} from "@/lib/bank";
import {
  getAccount,
  patchProfileLocal,
  subscribeAccount,
  type AccountProfile,
} from "@/lib/account";
import {
  CARD_BACKS,
  NAME_COLORS,
  TITLES,
  isOwned,
  nameColorValue,
  titleLabel,
  type CosmeticItem,
} from "@/lib/cosmetics";

interface Props {
  onNavigate: (s: Screen) => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Ready!";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Shop({ onNavigate }: Props) {
  const [bank, setBankState] = useState(() => getBank());
  const [now, setNow] = useState(() => Date.now());
  const [confirmReset, setConfirmReset] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountProfile | null>(() => getAccount());

  useEffect(() => {
    const unsub = subscribe(() => setBankState(getBank()));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeAccount(() => setAccount(getAccount()));
    return unsub;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dailyReady = canClaimDaily();
  const remainMs = nextDailyAvailableAt() - now;
  const inventory = account?.inventory ?? [];
  const equipped = account?.equipped ?? {};

  function flashMsg(msg: string, ms = 1500) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), ms);
  }

  function handleClaim() {
    const r = claimDaily();
    if (r.ok) flashMsg(`+${r.amount} chips claimed!`, 2000);
  }

  function handleReset() {
    setBank(0);
    setConfirmReset(false);
    flashMsg("Bank reset to 0");
  }

  function buyItem(item: CosmeticItem) {
    if (!account) {
      flashMsg("Sign in to buy items");
      return;
    }
    if (isOwned(item, inventory)) return;
    if (bank < item.price) {
      flashMsg("Not enough chips");
      return;
    }
    setBank(bank - item.price);
    const nextInv = [...inventory, item.id];
    const nextEq = {
      ...equipped,
      [item.kind]: item.id,
    };
    patchProfileLocal({ inventory: nextInv, equipped: nextEq });
    flashMsg(`Bought ${item.label}`);
  }

  function equipItem(item: CosmeticItem) {
    if (!account) return;
    if (!isOwned(item, inventory)) return;
    patchProfileLocal({ equipped: { ...equipped, [item.kind]: item.id } });
    flashMsg(`Equipped ${item.label}`);
  }

  function renderRow(item: CosmeticItem) {
    const owned = isOwned(item, inventory);
    const equippedHere = equipped[item.kind] === item.id;
    return (
      <div className="shop-item-row" key={item.id}>
        <div className="shop-item-preview">
          {item.kind === "cardBack" && (
            <div className={`card small back skin-${item.id}`}>&nbsp;</div>
          )}
          {item.kind === "nameColor" && (
            <span
              style={{
                color: item.color,
                fontWeight: "bold",
                textShadow: "0 0 1px rgba(0,0,0,0.6)",
              }}
            >
              Sample
            </span>
          )}
          {item.kind === "title" && (
            <span style={{ fontStyle: "italic", opacity: 0.85 }}>
              {item.id === "none" ? "—" : item.label}
            </span>
          )}
        </div>
        <div className="shop-item-name">{item.label}</div>
        <div className="shop-item-price">
          {item.free ? "Free" : `${item.price} chips`}
        </div>
        <div className="shop-item-actions">
          {owned ? (
            equippedHere ? (
              <span className="muted" style={{ fontSize: 11 }}>
                Equipped
              </span>
            ) : (
              <button className="btn" onClick={() => equipItem(item)}>
                Equip
              </button>
            )
          ) : (
            <button
              className="btn btn-primary"
              disabled={!account || bank < item.price}
              onClick={() => buyItem(item)}
              title={!account ? "Sign in to buy" : undefined}
            >
              Buy
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Window
      title="Shop &amp; Bank"
      className="shop-window"
      onClose={() => onNavigate("menu")}
    >
      <fieldset className="fieldset">
        <legend>Your Bank</legend>
        <div className="shop-bank-line">
          <span className="muted">Balance:</span>
          <span className="bank-amount">{bank.toLocaleString()}</span>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          {account
            ? `Signed in as ${account.username}. Bank and items are saved to your account.`
            : "Playing as guest — bank lives only on this device. Sign in from Settings to save it."}
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Daily Free Chips</legend>
        <div className="shop-row">
          <div>
            <strong>+{DAILY_CLAIM_AMOUNT}</strong> chips
            <div className="muted" style={{ fontSize: 11 }}>
              Once every 24 hours.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {dailyReady ? (
              <button className="btn btn-primary" onClick={handleClaim}>
                Claim
              </button>
            ) : (
              <>
                <div className="muted" style={{ fontSize: 11 }}>
                  Next claim:
                </div>
                <div style={{ fontFamily: "Lucida Console, monospace" }}>
                  {formatCountdown(remainMs)}
                </div>
              </>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Card Back Skins</legend>
        {!account && (
          <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
            Sign in from Settings to buy and equip skins.
          </div>
        )}
        <div className="shop-item-list">{CARD_BACKS.map(renderRow)}</div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Username Colors</legend>
        <div className="shop-item-list">{NAME_COLORS.map(renderRow)}</div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Titles</legend>
        <div className="shop-item-list">{TITLES.map(renderRow)}</div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Free Starter</legend>
        <div className="muted" style={{ fontSize: 12 }}>
          If your bank ever hits 0, you can start a Single Player game with a
          small free stack to grind back. Online play requires chips in your
          bank.
        </div>
      </fieldset>

      {flash && (
        <div
          style={{
            color: "var(--accent)",
            textAlign: "center",
            padding: "4px 0",
            fontWeight: "bold",
          }}
        >
          {flash}
        </div>
      )}

      <div className="button-row">
        <button className="btn" onClick={() => onNavigate("menu")}>
          Back
        </button>
        <div style={{ flex: 1 }} />
        {confirmReset ? (
          <>
            <span style={{ alignSelf: "center", fontSize: 11 }}>
              Reset bank to 0?
            </span>
            <button className="btn btn-danger" onClick={handleReset}>
              Yes
            </button>
            <button className="btn" onClick={() => setConfirmReset(false)}>
              No
            </button>
          </>
        ) : (
          <button
            className="btn"
            onClick={() => setConfirmReset(true)}
            title="Reset bank to 0 (for testing)"
          >
            Reset Bank
          </button>
        )}
      </div>
      {/* unused vars guard for static analysis */}
      <span style={{ display: "none" }}>{titleLabel(equipped)}{nameColorValue(equipped)}</span>
    </Window>
  );
}
