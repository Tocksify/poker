import { useState } from "react";
import { MainMenu } from "@/screens/MainMenu";
import { SingleSetup } from "@/screens/SingleSetup";
import { Online } from "@/screens/Online";
import { SettingsScreen } from "@/screens/Settings";
import { HoldemGame } from "@/screens/HoldemGame";
import { DrawGame } from "@/screens/DrawGame";

export type Screen =
  | "menu"
  | "setup"
  | "online"
  | "settings"
  | "game-holdem"
  | "game-draw";

export interface GameSetup {
  style: "holdem" | "draw";
  players: { name: string; isHuman: boolean }[];
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
}

interface Settings {
  playerName: string;
  showCardHints: boolean;
  fastBots: boolean;
}

const STORAGE_KEY = "poker-settings-v1";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return defaultSettings;
}

const defaultSettings: Settings = {
  playerName: "Player",
  showCardHints: true,
  fastBots: false,
};

function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [setup, setSetup] = useState<GameSetup | null>(null);

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
      {screen === "menu" && <MainMenu onNavigate={setScreen} />}
      {screen === "setup" && (
        <SingleSetup
          onNavigate={setScreen}
          playerName={settings.playerName}
          onStart={handleStart}
        />
      )}
      {screen === "online" && <Online onNavigate={setScreen} />}
      {screen === "settings" && (
        <SettingsScreen
          onNavigate={setScreen}
          settings={settings}
          onSave={saveSettings}
        />
      )}
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
