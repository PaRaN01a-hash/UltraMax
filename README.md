# Ultra MAX — Self-Host

Ultra MAX is a highly customisable catalog addon for Stremio and Nuvio —
trending titles, streaming-service rows, genres, curated collections,
studios, decades, Trakt/Simkl/MAL/AniList integrations, and a builder UI
for choosing exactly what shows up on your home screen and in what order.

This repo is the self-hostable version. If you'd rather not run your own
instance, the maintained hosted version is at **https://ultramax.vip**.

## Licence

Ultra MAX is licensed under **AGPL v3**. The short version: you're free to
run, modify and self-host this code. But if you run a **modified version
of it as a public-facing service** — anyone other than you can reach it
over a network — you're required to make your modified source available
to those users. See [LICENSE](LICENSE) for the full text. This applies
whether you're running it for a Discord server, a friend group, or the
general public.

## Prerequisites

- **Docker** and **Docker Compose**
- A **domain name** pointed at your server, with **SSL** (a reverse proxy
  like nginx + Let's Encrypt, or Caddy, or Cloudflare Tunnel — Stremio and
  Nuvio both require HTTPS for addon installs)
- A **TMDB API key** (required — the addon won't start without one)
- Optional but recommended: an **MDBList API key**, and OAuth app
  credentials for whichever of Trakt / Simkl / MyAnimeList / AniList you
  want to support — see below for each

## Quick start

```bash
git clone https://github.com/PaRaN01a-hash/Ultramax.git
cd Ultramax
cp .env.example .env
# edit .env — fill in BASE_URL, TMDB_KEY at minimum
docker compose up -d
```

The addon will be listening on the port you set in `.env` (`7000` by
default). Once your reverse proxy is in front of it, your setup page is at
`https://your-domain.com/setup.html`.

Check logs with `docker compose logs -f`, and confirm it's healthy with
`curl https://your-domain.com/health`.

## Reverse proxy (nginx example)

Ultra MAX needs to be reachable over HTTPS at the exact `BASE_URL` you put
in `.env` — OAuth providers will reject redirect URIs that don't match
what's registered, and Stremio/Nuvio won't install an addon served over
plain HTTP. A minimal nginx site config, assuming Certbot has already
issued a certificate for your domain:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:7000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

## Trakt OAuth setup

1. Go to https://trakt.tv/oauth/applications and create a new application.
2. Set **Redirect URI** to `BASE_URL/auth/trakt/callback` — e.g.
   `https://your-domain.com/auth/trakt/callback`.
3. Copy the generated **Client ID** and **Client Secret** into
   `TRAKT_CLIENT_ID` / `TRAKT_CLIENT_SECRET` in `.env`.
4. Restart the container (`docker compose up -d`) to pick up the change.

## Simkl OAuth setup

1. Go to https://simkl.com/settings/developer and create a new app.
2. Set **Redirect URI** to `BASE_URL/auth/simkl/callback`.
3. Copy the **Client ID** and **Client Secret** into `SIMKL_CLIENT_ID` /
   `SIMKL_CLIENT_SECRET` in `.env`.
4. Restart the container.

MyAnimeList and AniList follow the same pattern (`/auth/mal/callback` and
`/auth/anilist/callback` respectively) — see the comments in
`.env.example` for their developer-portal links. Both are fully optional:
leaving their credentials blank just disables that one integration with a
clear message, nothing else breaks.

## Data persistence

All per-user state — setup tokens, saved catalog configs, connected
OAuth accounts, community share links — lives under the `ultramax_data`
Docker volume (mounted at `/data` in the container, controlled by
`DATA_DIR`). This is the only thing you need to back up:

```bash
docker run --rm -v ultramax_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/ultramax-data-backup.tar.gz -C /data .
```

Restore by extracting that tarball back into the volume the same way, in
reverse.

## What's in this repo vs. what isn't

- `addon/` — the backend (catalogs, meta, streams, auth, config storage).
- `web/` — the frontend pages (setup, guide, badges, gallery, changelog).
- Removed before publishing: real user data (`configs.json`,
  `shares.json`, registered emails, recovery rate-limit state), the
  production `.env`, and various internal backup/dev-only files that
  aren't relevant to a fresh self-host.
- `web/*.html` still contain a number of hardcoded links back to
  `ultramax.vip` (the community gallery, badge downloads, changelog, etc.)
  that weren't in scope for this pass — some flows there will point at
  the hosted site rather than your own instance until that's cleaned up.
- A handful of preset collection cover images/GIFs in
  `addon/ultramax-collections.json` are hotlinked from `ultramax.vip`'s
  CDN, since those specific styled assets aren't bundled in this repo.

## Community

- Reddit: https://reddit.com/r/Ultra_Max
- Support the original project: https://ko-fi.com/ultramaxaddon
