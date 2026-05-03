/**
 * Build script for the Poker desktop app.
 *
 * Steps:
 *  1. Build the React frontend (Vite) → resources/frontend/
 *  2. Bundle the local server (esbuild) → src/server-bundle.cjs
 *
 * Run: node build.mjs
 * Then: npm run build   (which calls this + electron-builder)
 */

import { build } from "esbuild";
import { execSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ─── Step 1: Build the Poker React frontend ────────────────────────────────────
console.log("\n[build] Building poker frontend...");
try {
  execSync("pnpm --filter @workspace/poker run build", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      // Tell Vite the base path is / since the desktop server serves from root
      BASE_PATH: "/",
    },
  });
} catch (e) {
  console.error("[build] Frontend build failed:", e.message);
  process.exit(1);
}

// Copy the built frontend to resources/frontend/
const frontendDist = path.join(root, "artifacts", "poker", "dist", "public");
const frontendOut = path.join(__dirname, "resources", "frontend");

rmSync(frontendOut, { recursive: true, force: true });
mkdirSync(frontendOut, { recursive: true });

execSync(`cp -r "${frontendDist}/." "${frontendOut}/"`, { stdio: "inherit" });
console.log(`[build] Frontend copied to ${frontendOut}`);

// ─── Step 2: Bundle the desktop server ────────────────────────────────────────
console.log("\n[build] Bundling desktop server...");

const serverEntry = path.join(__dirname, "server", "index.ts");
const serverOut = path.join(__dirname, "src", "server-bundle.cjs");

await build({
  entryPoints: [serverEntry],
  platform: "node",
  bundle: true,
  format: "cjs",
  outfile: serverOut,
  sourcemap: false,
  logLevel: "info",
  // better-sqlite3 has a native .node binary — keep it external so the
  // packaged app's rebuilt version is used at runtime.
  external: [
    "better-sqlite3",
    "*.node",
    // Electron is never needed in the server bundle
    "electron",
  ],
  // Ensure __dirname and __filename work in the CJS bundle
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

console.log(`[build] Server bundle written to ${serverOut}`);
console.log("\n[build] Done! Now run: npm run build (from poker-desktop/)");
