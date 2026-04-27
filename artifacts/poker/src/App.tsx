import { useEffect, useState } from "react";
import { MainMenu } from "@/screens/MainMenu";
import { SingleSetup } from "@/screens/SingleSetup";
import { OnlineHome } from "@/screens/OnlineHome";
import { CreateRoom } from "@/screens/CreateRoom";
import { JoinRoom } from "@/screens/JoinRoom";
import { OnlineLobby } from "@/screens/OnlineLobby";
import { OnlineGame } from "@/screens/OnlineGame";
import { SettingsScreen } from "@/screens/Settings";
import { Shop } from "@/screens/Shop";
import { HoldemGame } from "@/screens/HoldemGame";
import { DrawGame } from "@/screens/DrawGame";
import { getBank, subscribe } from "@/lib/bank";

export type Screen =
  | "menu"
  | "setup"
  | "online"
  | "online-create"
  | "online-join"
  | "online-lobby"
  | "online-game"
  | "settings"
  | "shop"
  | "game-holdem"
  | "game-draw";

export interface GameSetup {
  style: "holdem" | "draw";
  players: { name: string; isHuman: boolean }[];
  startingChips: number; // both human and bots get this
  smallBlind: number;
  bigBlind: number;
  ante: number;
  isFreeStarter: boolean; // true when bank was 0 and we used the free starter
}

interface Settings {
  playerName: string;
  showCardHints: boolean;
  fastBots: boolean;
}

const STORAGE_KEY = "poker-settings-v1";

const defaultSettings: Settings = {
  playerName: "",
  showCardHints: true,
  fastBots: false,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return defaultSettings;
}

function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [bank, setBank] = useState<number>(() => getBank());

  // Subscribe to bank changes for live updates
  useEffect(() => {
    const unsub = subscribe(() => setBank(getBank()));
    return unsub;
  }, []);

  function saveSettings(s: Settings) {
    setSettings(s);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {}
  }

  function handleStart(s: GameSetup) {
    setSetup(s);
    setScreen(s.style === "holdem" ? "game-holdem" : "game-draw");
  }

  return (
    <div className="app-root">
      {screen === "menu" && (
        <MainMenu
          onNavigate={setScreen}
          playerName={settings.playerName}
          bank={bank}
        />
      )}
      {screen === "setup" && (
        <SingleSetup
          onNavigate={setScreen}
          playerName={settings.playerName || "Player"}
          onStart={handleStart}
        />
      )}
      {screen === "online" && (
        <OnlineHome onNavigate={setScreen} bank={bank} />
      )}
      {screen === "online-create" && (
        <CreateRoom
          onNavigate={setScreen}
          playerName={settings.playerName}
        />
      )}
      {screen === "online-join" && (
        <JoinRoom onNavigate={setScreen} playerName={settings.playerName} />
      )}
      {screen === "online-lobby" && (
        <OnlineLobby onNavigate={setScreen} bank={bank} />
      )}
      {screen === "online-game" && (
        <OnlineGame onNavigate={setScreen} bank={bank} />
      )}
      {screen === "settings" && (
        <SettingsScreen
          onNavigate={setScreen}
          settings={settings}
          onSave={saveSettings}
        />
      )}
      {screen === "shop" && <Shop onNavigate={setScreen} />}
      {screen === "game-holdem" && setup && (
        <HoldemGame
          setup={setup}
          fastBots={settings.fastBots}
          showHints={settings.showCardHints}
          onExit={setScreen}
        />
      )}
      {screen === "game-draw" && setup && (
        <DrawGame
          setup={setup}
          fastBots={settings.fastBots}
          showHints={settings.showCardHints}
          onExit={setScreen}
        />
      )}

      <div className="corner-label left">Rocco Albán Poker</div>
      <div className="corner-label right">Angel has a chili ring</div>
    </div>
  );
}

export default App;
