# ai-fps

A browser-based multiplayer PVP FPS prototype built with a TypeScript
Colyseus server and a React/Three.js client. Players join a shared arena, move
with first-person controls, shoot other connected players, reload, respawn, and
compete on a live scoreboard.

The project is split into two standalone packages:

- `backend`: Colyseus authoritative game server, room state, combat rules, and
  tests.
- `frontend`: React Router app with a Three.js arena rendered through
  `@react-three/fiber`.

## Features

- Real-time multiplayer room powered by Colyseus.
- First-person pointer-lock aiming and keyboard movement.
- Shared arena with buildings, walls, crates, and collision blocking.
- Server-side movement, shooting, health, scoring, reloads, deaths, and
  respawns.
- Client-side prediction for smoother local movement.
- HUD with health, ammo, status, hit feedback, damage flash, and scoreboard.

## Tech Stack

- TypeScript
- Colyseus
- React 19
- React Router 7
- Three.js and `@react-three/fiber`
- Mantine
- Tailwind CSS
- Oxlint and oxfmt

## Repository Layout

```text
.
+-- backend/     # Colyseus game server
`-- frontend/    # React Router browser client
```

## Requirements

- Node.js 20.9 or newer
- Yarn

Install dependencies in each package:

```bash
cd backend
yarn install

cd ../frontend
yarn install
```

## Development

Start the backend server:

```bash
cd backend
yarn dev
```

By default, the Colyseus server listens on `ws://localhost:2567`.

In another terminal, start the frontend:

```bash
cd frontend
yarn dev
```

Open the frontend development URL, usually `http://localhost:5173`, enter a
player name, and join the arena.

To connect the frontend to a different Colyseus server, set:

```bash
VITE_COLYSEUS_URL=ws://localhost:2567
```

## Controls

- `W`, `A`, `S`, `D`: move
- Mouse: look around after clicking the arena
- Left click: shoot
- `R`: reload
- `Shift`: run
- `Space`: jump
- `C` or `Ctrl`: crouch

## Scripts

Backend:

```bash
cd backend
yarn dev
yarn test
yarn build
yarn oxmint
yarn oxfmt
```

Frontend:

```bash
cd frontend
yarn dev
yarn typecheck
yarn build
yarn oxmint
yarn oxfmt
```

## Production Build

Build both packages:

```bash
cd backend
yarn build

cd ../frontend
yarn build
```

Run the built frontend server from `frontend`:

```bash
yarn start
```

Run the backend with your preferred Node process manager using
`backend/build/index.js` after building.

## Notes

This is an early public prototype. The gameplay code is intentionally compact
and focused on the core multiplayer FPS loop rather than account systems,
matchmaking, persistence, or production hardening.

## License

No license has been declared yet. Add a `LICENSE` file before accepting external
contributions or reuse.
