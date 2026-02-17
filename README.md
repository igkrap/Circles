# Dodger Shooter (Phaser)

This is a Phaser 3 + Vite starter port of the original pygame build.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite (default: http://localhost:5173).

## PVP server (Colyseus, Mac mini / local)

1. Create `.env` from `.env.example` and set:
- `VITE_PVP_SERVER_URL`
- `VITE_GOOGLE_CLIENT_ID`

2. Server env (shell export) and start:

- `JWT_SECRET` (required in real deployment)
- `GOOGLE_CLIENT_ID` (same client id used by web)
- `PORT` (optional, default: `8788`)
- `APP_DB_PATH` (optional, generic user progress DB, default: `server/app.sqlite`)
- `PVP_DB_PATH` (optional, PVP rating/match DB, default: `server/pvp.sqlite`)

```bash
npm run dev:server
```

3. Start client:

```bash
npm run dev
```

Server default URL is `http://localhost:8788`.

## Production deploy (Mac server + GitHub Pages)

Target:
- Frontend: `https://igkrap.github.io/Circles`
- Server: `http://59.19.43.53:30000`

Important:
- `https` frontend cannot call `http/ws` backend due browser mixed-content policy.
- For GitHub Pages frontend, set backend to `https://...` (and websocket `wss://...`).
- Use a domain + TLS reverse proxy (Caddy/Nginx) in front of `:30000`.

### 1) Mac server setup

```bash
cd ~/Circles
cp server/.env.server.example .env.server
# edit .env.server
chmod +x scripts/server/*.sh
bash scripts/server/install-launchd.sh
```

### 2) Mac server deploy/update

```bash
cd ~/Circles
bash scripts/server/deploy-mac.sh
```

Useful commands:

```bash
launchctl print gui/$(id -u)/io.igkrap.circles.server
tail -f logs/server.out.log logs/server.err.log
curl http://127.0.0.1:30000/health
bash scripts/server/stop-launchd.sh
```

### 3) Frontend env for GitHub Pages

Set GitHub Repository Variables:
- `VITE_PVP_SERVER_URL`: `https://<your-server-domain>`
- `VITE_GOOGLE_CLIENT_ID`: same Google Web Client ID used by server

Workflow file: `.github/workflows/deploy.yml`

## Controls

- Desktop: WASD / Arrow keys to move, mouse to aim.
- Mobile/touch:
  - Left half drag: movement
  - Right half drag: aiming

## Notes

- Audio files are in `public/assets/`.
- Save data uses `localStorage` (persists across runs) for `totalGold`.
- This port currently includes:
  - Stage progression (linear difficulty)
  - Boss every 5 stages
  - Enemy variety from early stages
  - Gold drops + persistent total gold
  - Floating damage numbers

You can extend it with your ability system, synergy, and shop meta later.
