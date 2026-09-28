# Edge proxy (shared Lightsail host)

One Lightsail instance (the `blastjax` one) hosts three sites, each deployed from its own repo:

| Site | Repo | Upstream alias on the `edge` network |
|------|------|--------------------------------------|
| `blastjax.maiacruz.com` (+ `http://18.138.5.2`) | `blastjax/blastjax` | `blastjax-api:8000` (`/api/*`), `blastjax-web:3000` |
| `portfolio.maiacruz.com` | `blastjax/portfolio-film` | `portfolio-web:3000` |
| `maiacruz.com` | `blastjax/icrc` | `icrc-web:5000` |

Only one process can own ports 80/443, so none of the three stacks runs its own Caddy there. A single
Caddy, the **edge proxy** defined in this directory, terminates TLS for every domain and forwards to each
app over an external Docker network called `edge`.

## How it fits together

```
/srv/edge/
  bin/edge-install        # helper every deploy uses (from docker/edge/edge-install)
  caddy/Caddyfile         # base config: `import sites/*.caddy` (from docker/edge/Caddyfile)
  caddy/sites/
    blastjax.caddy        # each repo's own site block, installed by that repo's deploy
    portfolio.caddy
    icrc.caddy
```

- **This repo owns the proxy.** The blastjax deploy creates `/srv/edge` and the `edge` network, installs
  `edge-install` and the base Caddyfile, and runs `docker compose -f docker/edge/docker-compose.yml up -d`
  (container `edge-caddy`, compose project `edge`, cert storage in the `edge_caddy_data` volume).
- **Each app joins through an overlay.** `docker-compose.edge.yml` in each repo attaches the app to the
  `edge` network under its unique alias, and puts that stack's own `caddy` service behind a profile so it
  never starts. The aliases matter because all three apps have a service called `web`.
- **Each site block is its repo's existing Caddyfile.** The deploy installs it with
  `/srv/edge/bin/edge-install sites/<app>.caddy <file>`. That hot-reloads Caddy without a restart, so the
  other sites don't blip. If Caddy rejects the new file, `edge-install` puts the previous one back and
  fails the deploy, so a bad block can't sit on disk waiting to break every site on the next restart.
- **Detection:** the portfolio-film and icrc deploys use edge mode only when `/srv/edge/bin/edge-install`
  exists. On any other host they deploy standalone with their own Caddy, exactly as before.
- **Local dev is unchanged.** A plain `docker compose up` never reads `docker-compose.edge.yml`, so each
  repo still runs on its own with its own Caddy.

Deploys from the three repos can run at the same time: each only touches its own compose project and its
own site file, and each logs in to GHCR with a private `DOCKER_CONFIG`, so one repo's
`docker logout` can't break another's pull.

## Moving portfolio-film and icrc onto this host (one-time)

Do these steps after the blastjax deploy that introduced the edge proxy has run on this host (check that
`docker ps` shows `edge-caddy`).

1. **Point the two repos' deploys at this host.** In each repo, go to **Settings → Secrets and variables →
   Actions**:
   - `blastjax/portfolio-film` secrets: `DEPLOY_HOST` = this host's IP (`18.138.5.2`), `DEPLOY_SSH_KEY` =
     the same private key as blastjax's `DEPLOY_SSH_KEY`, `APP_DIR` = `/home/ubuntu/portfolio-film`.
   - `blastjax/icrc` secrets: `DEPLOY_HOST`, `DEPLOY_SSH_KEY` (same values as above). Variables:
     `APP_DIR` = `/home/ubuntu/icrc`.

   `APP_DIR` doesn't need to exist yet: the first deploy checks the repo out there itself.
2. **Copy the portfolio photo library.** It is the only state on the old hosts; icrc's data is in Neon.
   Stop the app first, so SQLite's WAL is flushed and no upload lands mid-copy. Copy the whole `data/`
   directory: `portfolio.db` plus any `-wal`/`-shm` files, and `admin-credentials.json` if it exists.
   From a machine that can SSH into both hosts:
   ```bash
   ssh ubuntu@OLD_PORTFOLIO_HOST 'cd "<old APP_DIR>" && docker compose stop web && sudo tar czf - data' > portfolio-data.tgz
   scp portfolio-data.tgz ubuntu@18.138.5.2:
   ssh ubuntu@18.138.5.2 'mkdir -p /home/ubuntu/portfolio-film && tar xzf portfolio-data.tgz -C /home/ubuntu/portfolio-film'
   ```
   If you want the old site to keep serving until DNS moves, run `docker compose start web` on the old
   host again afterwards. Don't upload photos there in the meantime, because they won't be carried over.
   The deploy fixes the file ownership that the container needs (`chown 1001:1001 data`).
3. **Deploy both apps here.** Run each repo's deploy workflow from the Actions tab (**Run workflow** on
   `main`). Each should end with `edge-caddy is running and reaches <alias>`.
4. **Move DNS.** Point the `A` records for `portfolio.maiacruz.com` and `maiacruz.com` at `18.138.5.2`.
   Caddy requests the certificates once Let's Encrypt can reach this host for those names. It retries on
   its own with growing backoff, so to have them issued straight away once DNS resolves here, run
   `docker restart edge-caddy` on the host. That takes a couple of seconds.
5. **Check, then retire the old instances.** Browse each site. `docker logs edge-caddy` shows certificate
   issuance. Once all three sites have served correctly for a few days, snapshot and delete the old
   portfolio and icrc instances, and release their static IPs, which Lightsail bills while unattached.

## Capacity

Measured with all three stacks running under light load: about 330 MiB of container memory in total
(portfolio-web ~105, icrc-web ~100, blastjax-api ~55, blastjax-web ~45, edge-caddy ~15, the two Redis
instances ~4 each). This fits a 1 GB instance, but not with much headroom. Photo uploads, which run through
`sharp` in portfolio-web, spike well above that. Add swap so a spike slows the box down instead of
OOM-killing a container:

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Or move to the 2 GB bundle: snapshot, then create a new instance from the snapshot and reattach the static IP.

## Useful commands (on the host)

```bash
docker ps                                           # everything, all three stacks + edge-caddy
docker logs --tail 100 edge-caddy                   # TLS / proxy errors
ls /srv/edge/caddy/sites                            # which sites the proxy serves
docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```
