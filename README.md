# UK Road Trip Project

Shared road-trip planner for two people:
- interactive UK map
- search for places
- add icon pins and notes
- share by trip link
- server-side persistence (JSON file)

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run frontend + API together:

```bash
npm run dev:all
```

3. Open:

```text
http://localhost:5173
```

The frontend proxies /api calls to the local API server on port 8787.

## Production On Your Server

1. Build frontend:

```bash
npm run build
```

2. Start app server:

```bash
npm start
```

Default server port is 8787. To change it:

```bash
PORT=3000 npm start
```

On Windows PowerShell:

```powershell
$env:PORT=3000; npm start
```

## How Shared Data Works

- API persists trips in data/trips.json
- each board is identified by the trip query string, for example:

```text
https://your-domain.com/?trip=me-and-partner
```

- send that exact link to your partner
- both of you will read/write the same trip board

## API Endpoints

- GET /api/health
- GET /api/trips/:tripId/pins
- POST /api/trips/:tripId/pins
- DELETE /api/trips/:tripId/pins/:pinId

## Deployment Notes

- make sure your process manager restarts the app (PM2, systemd, Docker, etc.)
- keep the data directory writable so trips persist
- reverse-proxy with Nginx/Caddy if you want HTTPS on your domain

## Railway Deployment (Recommended)

1. Push this folder to GitHub.
2. In Railway, create a new project from that GitHub repo.
3. If your repo contains multiple folders, set Root Directory to road_trip_project.
4. Railway will detect Node and use:
	- build command: npm run build
	- start command: npm start
5. Add a persistent volume in Railway and mount it at /data.
6. Add environment variable DATA_DIR=/data.
7. Deploy and open your domain.

Your app data will then persist at /data/trips.json across redeploys.

### Share Link Example

Use a trip slug in the URL and send it to your partner:

https://your-railway-domain.up.railway.app/?trip=me-and-partner

Both of you will be editing the same board for that trip slug.
