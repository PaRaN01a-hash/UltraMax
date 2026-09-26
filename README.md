# Ultra MAX — Self-Host 8.1.4

**Ultra MAX is a free, customisable discovery, catalog and metadata addon for Nuvio and Stremio.** This repository is the self-hostable edition of the project.

If you do not want to run your own instance, the maintained hosted service is at **https://ultramax.vip**. Current official project information lives at **https://ultramax.vip/about.html**.

## Current self-host release

- Version: **8.1.4**
- Updated: **26 September 2026**
- Runtime: Node 20 + Docker
- Persistence: local `/data` volume by default
- Clients: Nuvio and Stremio

This release brings the self-host edition back in line with the current Ultra MAX addon core while keeping production-only infrastructure disabled by default.

## Included

- personalised movie and TV catalog layouts
- profiles and saved setups
- curated catalogs, custom rows and collections
- search and recommendation tools
- language, region and content controls
- TMDB and MDBList discovery providers
- optional TVDB and OMDb metadata providers
- Trakt, Simkl, MyAnimeList and AniList integrations
- artwork/provider support used by the current builder
- optional stream/debrid integrations
- Premiumize Cloud Library
- TorBox Cloud Library
- current Ultra MAX setup UI and provider branding

Large poster/badge artwork is loaded from the public Ultra MAX asset host rather than bundled into every clone. Provider logos, UI code, translations and core interface assets remain local.

## Requirements

- Docker and Docker Compose
- a domain name with HTTPS for remote Nuvio/Stremio installs
- a TMDB API key
- optional credentials for whichever integrations you enable

## Quick start

```bash
git clone https://github.com/PaRaN01a-hash/UltraMax.git
cd UltraMax
cp .env.example .env
```

Edit `.env` and set at least:

```env
BASE_URL=https://your-domain.example
TMDB_KEY=your_tmdb_api_key
```

Start Ultra MAX:

```bash
docker compose up -d --build
```

Open:

```text
https://your-domain.example/setup.html
```

Health check:

```bash
curl https://your-domain.example/health
```

Logs:

```bash
docker compose logs -f ultramax
```

## Discovery providers

At least one **core discovery provider** is required for each user setup:

- TMDB
- MDBList

The self-host server still needs its own `TMDB_KEY` for metadata resolution and fallback operations.

Optional user metadata providers:

- TVDB
- OMDb

TVDB and OMDb supplement metadata but do not replace TMDB/MDBList core discovery.

## Cloud Library

Ultra MAX can scan supported files already stored in a user's cloud account and expose matched movie and series rows with Ultra MAX metadata.

Supported providers:

- Premiumize
- TorBox

TorBox Cloud Library can reuse a TorBox credential already configured under Streams or accept a dedicated TorBox API key.

## OAuth integrations

Optional OAuth integrations include Trakt, Simkl, MyAnimeList and AniList. Create your own developer application for each service you enable and use callbacks on your own `BASE_URL`, for example:

```text
https://your-domain.example/auth/trakt/callback
https://your-domain.example/auth/simkl/callback
https://your-domain.example/auth/mal/callback
https://your-domain.example/auth/anilist/callback
```

## Nuvio collection sync

Nuvio collection-write features require your own Nuvio application credentials where supported. Hosted Ultra MAX credentials are not distributed with the self-host edition. Leaving those credentials blank does not affect normal catalog/addon use.

## Persistence and backups

The supplied Compose file stores state in the `ultramax_data` named volume mounted at `/data`.

Example backup:

```bash
docker run --rm \
  -v ultramax_data:/data \
  -v "$PWD":/backup \
  alpine \
  tar czf /backup/ultramax-data-backup.tar.gz -C /data .
```

Never commit your live `.env` or `/data` contents.

## Reverse proxy

Expose the container through HTTPS using nginx, Caddy, Nginx Proxy Manager, Cloudflare Tunnel or another reverse proxy. The container listens on port `7000` internally.

Minimal nginx example:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.example;

    location / {
        proxy_pass http://127.0.0.1:7000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Hosted-only infrastructure

The public self-host edition does not require Ultra MAX production infrastructure. These remain disabled by default unless a self-hoster deliberately supplies their own supporting services and configuration:

- production PostgreSQL profile-store ownership
- hosted UltraPlay bridge credentials
- hosted sports/transcoder infrastructure
- production Resend inbound forwarding
- internal monitoring/control services

The default self-host deployment uses the local `/data` JSON configuration store and survives container restarts without PostgreSQL.

## Licence

Ultra MAX is licensed under **AGPL v3**. You may run, modify and self-host it. If you expose a modified version over a network, AGPL obligations may require you to make the modified source available to users. See [LICENSE](LICENSE).

## Official links

- Website: https://ultramax.vip/
- Current project information: https://ultramax.vip/about.html
- Hosted project source/history: https://github.com/PaRaN01a-hash/ultra-max-addon
- Self-host edition: https://github.com/PaRaN01a-hash/UltraMax
- Discord: https://discord.gg/dbaXb6wpk
- Reddit: https://reddit.com/r/Ultra_Max
- Ko-fi: https://ko-fi.com/ultramaxaddon

Older search results may mention v5, v6, v7 or early v8 releases. Those are historical. Use **https://ultramax.vip/about.html** for the current hosted product description.
