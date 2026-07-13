# Pete Panel — The Agentic WordPress Environment

![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-8.1%20%7C%208.2%20%7C%208.3-777BB4?logo=php&logoColor=white)
![WordPress](https://img.shields.io/badge/WordPress-ready-21759B?logo=wordpress&logoColor=white)
![Apple Silicon](https://img.shields.io/badge/Apple%20Silicon-M1%E2%80%93M5-000000?logo=apple&logoColor=white)

> A safe, disposable, full-stack WordPress environment your AI agent can own. Clone production, let Claude do the heavy lifting, gate the risky steps, and ship — all inside Docker.

**Pete Panel** is the control panel built for **agentic development**. This repository is the Docker stack that powers a Pete Panel **dev playground** on your Mac — giving an AI coding agent like Claude real WP-CLI, files, database, and logs to operate directly, on a throwaway copy of your site, while production never feels a thing.

🔗 **Learn more:** [What is an agentic WordPress environment?](https://deploypete.com/what-is-an-agentic-wordpress-environment/) · [Dev Playgrounds](https://deploypete.com/dev-playgrounds/) · [deploypete.com](https://deploypete.com)

---

## Why an agentic WordPress environment?

AI agents can rebuild a theme, migrate a site off a page builder, or recreate a landing page in a single session — but nobody should point an agent at production. Pete gives the agent a perfect, disposable copy of your site, isolated in Docker.

- **Built for AI agents** — real WP-CLI, files, database, and logs, not a limited dashboard API.
- **Isolated & disposable** — the agent works on a copy; if a run goes sideways, delete it and clone again.
- **Field-tested workflows** — one-line commands like [`/retheme`](https://deploypete.com/workflows/) and [`/reblock`](https://deploypete.com/workflows/) run entire gated migrations.
- **Humans hold the keys** — rights gates and deploy gates keep people in charge of the irreversible steps.

---

## Requirements

- An **Apple silicon Mac** (M1 / M2 / M3 / M4 / M5)
- **Docker Desktop** (running)
- **Git**

> Intel Macs, Windows, and Linux are not supported for the local dev playground. The production installer, however, runs on any Ubuntu 24.04 server — see [Deploying to Production](https://deploypete.com/deploying-to-production/).

---

## Quick start

```bash
git clone https://github.com/peterconsuegra/wp-pete-docker.git
cd wp-pete-docker
cp .env.example.development .env
docker compose up --build
```

When the containers are healthy, open **http://pete.petelocal.net/** over **HTTP (not HTTPS)** — you'll see the WordPress setup screen. Code inside the container with VS Code's **Dev Containers** extension: attach to the `php` container and open `/var/www/html`.

---

## What's inside

| Service | Role |
|---|---|
| **Apache** | Web server — MPM Event + HTTP/2, ports 80/443 |
| **PHP-FPM** | WordPress runtime — PHP 8.1 / 8.2 / 8.3, switchable |
| **MariaDB** (`db`) | Database |
| **Redis** | Object cache |
| **phpMyAdmin** | Database UI (auto-installed on first boot) |

Plus ModSecurity + the OWASP Core Rule Set (WAF) and Let's Encrypt SSL in the production profiles.

**Persistent volumes:** `wp_data` (WordPress sites + Pete Panel), `db_data`, `pma_data`, `ssl_data`, `apache_logs`, `ssh_data`, `apache_sites_available`, `apache_sites_enabled`.

---

## Work with an AI agent

Once the playground is up, it's an [agentic WordPress environment](https://deploypete.com/what-is-an-agentic-wordpress-environment/): point Claude at it and it gets everything a senior developer touches.

```bash
# Shell into the runtime and use WP-CLI on a full copy of the site
docker compose exec php bash
wp option get blogname
```

Then run a field-tested workflow:

- **`/retheme`** — migrate a legacy theme (Divi, Genesis) to a Full-Site-Editing block theme. → [Guide](https://deploypete.com/guides/migrate-divi-to-block-theme/)
- **`/reblock`** — rebuild any page, on any stack (WordPress, Shopify, Webflow, headless, static), as a self-contained WordPress block theme. → [Guide](https://deploypete.com/guides/rebuild-any-page-as-wordpress-blocks/)

---

## Docker cheat-sheet

Run these from the project folder (`wp-pete-docker`).

| Task | Command |
|---|---|
| Start / rebuild the stack | `docker compose up --build` |
| Shell into a container | `docker compose exec php bash` · `docker compose exec apache bash` · `docker compose exec db bash` |
| Rebuild after a Dockerfile edit | `docker compose build --no-cache php` |
| Restart Apache in place | `docker compose exec apache apache2ctl restart` |
| Enter MariaDB as root | `docker compose exec db mysql -u root -p` (password = `MYSQL_ROOT_PASSWORD` in `.env`) |
| Reset phpMyAdmin | `docker compose down` then `docker volume rm wp-pete-docker_pma_data` |
| Delete **all** volumes (irreversible) | `docker compose down -v` |

WordPress files live at `/var/www/html`; Apache v-hosts at `/etc/apache2/sites-available` (edit, then `apache2ctl graceful`).

---

## Deploy to production

The same stack runs on any Ubuntu 24.04 server. One command installs it, auto-tuning Docker resources to the machine's RAM and CPU:

```bash
curl -o pete_installer.sh -L https://deploypete.com/pete_installer.sh && chmod 755 pete_installer.sh && sudo ./pete_installer.sh
```

Ready-made server profiles are included: `docker-compose.prod-8ram-4cpu.yml`, `docker-compose.prod-16ram-4cpu.yml`, `docker-compose.prod-16ram-6cpu.yml`, `docker-compose.prod-32ram-8cpu.yml`. See the full per-cloud guides for [Linode, Hetzner, Google Cloud & AWS](https://deploypete.com/deploying-to-production/) and the [performance benchmarks by server size](https://deploypete.com/benchmarks/).

To bring an existing site in, use the free [Pete Converter](https://deploypete.com/plugins/) to export any WordPress site into Pete format and import it into a playground or production.

---

## Under the hood

On first boot, the `php` container runs `php/pete_install.sh`, which waits for the database, prepares `/var/www/html`, installs phpMyAdmin, and brings up the **Pete Panel control panel** — a Laravel application, cloned from [`peterconsuegra/pete-panel`](https://github.com/peterconsuegra/pete-panel), that manages sites, Apache v-hosts, SSL, backups, and exports. Docker provides the isolated, tuned infrastructure; the control panel provides the hosting logic. The installer checks out the latest stable Git tag so environments are deterministic.

**Apache internal reload** — the control panel triggers config reloads via `APACHE_RELOAD_URL` (`http://apache/internal-reload`), authenticated with `APACHE_RELOAD_SECRET`, so v-host and certificate changes apply without recreating containers.

---

## Development & release policy

Pete Panel follows a **stable-first** workflow:

- `master` always holds the latest stable, production-ready version.
- Experimental work stays off `master`.
- Stable releases are validated, then tagged.

```bash
git checkout master
git pull origin master
git tag v14.9
git push origin v14.9
```

The Docker installer checks out the latest Git tag, so Docker environments, production servers, and dashboard integrations always run a verified, immutable release snapshot.

---

## Learn more

- 🏠 [Pete Panel + Claude](https://deploypete.com/) — why an AI agent needs a real environment
- 🧩 [What is an agentic WordPress environment?](https://deploypete.com/what-is-an-agentic-wordpress-environment/)
- ⚡ [Workflows](https://deploypete.com/workflows/) — `/retheme` and `/reblock`
- 📚 [Guides](https://deploypete.com/guides/) — migrate, clone, rebuild, and move WordPress sites
- 📊 [Benchmarks](https://deploypete.com/benchmarks/) — throughput by server size
- ⚖️ [Compare](https://deploypete.com/compare/) — vs LocalWP, DevKinsta, Docker, WP Engine, WordPress VIP
- 💬 [Contact & Enterprise](https://deploypete.com/contact-us/)

---

_Pete Panel — the control panel built for agentic WordPress development. Build locally on your Mac, hand the keys to your AI agent, and deploy anywhere._
