# Deploy Guide (Mac server + GitHub Pages)

## Architecture

- Frontend: `https://igkrap.github.io/Circles` (GitHub Pages)
- Game server: Node/Colyseus on Mac (`127.0.0.1:30000` internally)
- Public access to server: `https://<your-domain>` via reverse proxy TLS

## Why TLS is required

GitHub Pages is always `https`.  
Browsers block calls from `https` page to `http` API/websocket.

So this combination will fail:
- Frontend: `https://igkrap.github.io/Circles`
- Backend: `http://59.19.43.53:30000`

Use `https://<domain>` for backend and set `VITE_PVP_SERVER_URL` to that URL.

## 1) Server environment

On Mac:

```bash
cd ~/Circles
cp server/.env.server.example .env.server
```

Edit `.env.server`:

```env
PORT=30000
JWT_SECRET=<long-random-secret>
GOOGLE_CLIENT_ID=<google-web-client-id>
CLIENT_ORIGIN=https://igkrap.github.io
APP_DB_PATH=server/app.sqlite
PVP_DB_PATH=server/pvp.sqlite
```

## 2) Install service (launchd)

```bash
cd ~/Circles
chmod +x scripts/server/*.sh
bash scripts/server/install-launchd.sh
```

Check:

```bash
launchctl print gui/$(id -u)/io.igkrap.circles.server
tail -f logs/server.out.log logs/server.err.log
curl http://127.0.0.1:30000/health
```

## 3) Deploy update

```bash
cd ~/Circles
bash scripts/server/deploy-mac.sh
```

The script does:
- `git pull` on `main`
- `npm ci --omit=dev`
- reinstall/restart launchd service
- local health check

## 4) TLS reverse proxy example (Caddy)

`/etc/caddy/Caddyfile`:

```caddy
api.your-domain.com {
  reverse_proxy 127.0.0.1:30000
}
```

Then set DNS `A` record to your public IP and restart Caddy.

Backend URL used by frontend must be:

```text
https://api.your-domain.com
```

## 5) GitHub Pages frontend env

In GitHub repo settings, add **Repository variables**:

- `VITE_PVP_SERVER_URL` = `https://api.your-domain.com`
- `VITE_GOOGLE_CLIENT_ID` = `<google-web-client-id>`

Workflow `.github/workflows/deploy.yml` already injects these variables into `npm run build`.

## 6) Stop/remove service

```bash
cd ~/Circles
bash scripts/server/stop-launchd.sh
```
