# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

- **poker** — A poker game (Texas Hold'em + Five Card Draw) with a flat green-felt UI (MS Sans Serif font kept). Single-player vs bots and online multiplayer rooms with invite codes.
- **api-server** — Express + WebSocket server. Hosts the online poker room manager (`src/lib/rooms.ts`) and broadcasts authoritative server-side game state to clients via WS at `/ws` (also accepts `/api/ws` for proxy passthrough). Engine code is shared by copying `src/poker/{cards,holdem,draw}.ts` from the poker artifact.

## Online Poker Notes

- Frontend talks to backend at `wss://<host>/api/ws` (proxied by the path-based router to api-server).
- Each WS connection gets a `welcome` message with a generated `playerId` (used as the room/seat key).
- Server is the single source of truth for game state. It redacts other players' hole/hand cards (only your own cards are sent to your socket; everything is revealed at hand-end).
- Bots run server-side via a `setTimeout` ticker on the room (700–1300 ms thinking time). Disconnects during a hand convert that seat to a bot so the game can continue; lobby disconnects free the seat.
- Host (room creator) controls Start, Add Bot, Remove Player, Deal Next Hand. Optional `fillBots` config fills empty seats with bots when the host starts.
- Online button on the main menu is gated on a non-empty player name being set in Settings (stored in `localStorage` under `poker-settings-v1`).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
