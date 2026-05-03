import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element not found");
}

createRoot(rootEl).render(
  <div className="launch-screen">
    <div className="launch-card">
      <div className="title-text">POKER</div>
      <div className="subtitle">Loading table...</div>
    </div>
  </div>,
);

window.setTimeout(() => {
  createRoot(rootEl).render(<App />);
}, 300);
