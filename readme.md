
# Pete Panel Docker Environment  
WordPress + WooCommerce + Laravel (Docker Stack)

Pete Panel is a developer-first control panel for launching, cloning, migrating, and syncing WordPress and Laravel projects in minutes.

This repository provides the full Docker LAMP stack that powers Pete locally and in production profiles.

👉 Learn more about Pete Dev Playgrounds:  
https://deploypete.com/dev-playgrounds/

---

# 🚀 What This Stack Includes

• Apache (MPM Event + HTTP/2)  
• PHP-FPM (WordPress + Laravel runtime)  
• MariaDB (tuned for dev & production)  
• Redis  
• phpMyAdmin (auto-installed)  
• Automated first-run Pete installer  
• Multiple performance profiles (dev, 16GB, 32GB)

---

# 🧠 How the Architecture Works

Browser  
→ Apache (port 80/443)  
→ PHP-FPM (port 9000 internal)  
→ MariaDB / Redis  

Volumes persist:

| Volume | Purpose |
|--------|---------|
| wp_data | WordPress sites + Pete Panel |
| db_data | Database storage |
| pma_data | phpMyAdmin files |
| ssl_data | Let's Encrypt certificates |
| apache_logs | Apache logs |
| ssh_data | Shared SSH keys |

---

# 🔗 How This Docker Environment Connects to the Pete Panel Laravel Control Panel

This Docker stack is tightly integrated with the Pete Panel Laravel hosting control panel via:

```
php/pete_install.sh
```

This script bridges:

• Docker infrastructure (Apache, PHP, DB, Redis)  
• The Pete Panel Laravel application  
• The DeployPete dashboard (https://dashboard.deploypete.com)  

---

## 🧩 What Happens on First Boot

When the `php` container starts, `pete_install.sh` runs automatically.

### 1️⃣ Infrastructure Preparation

- Waits for MariaDB
- Fixes permissions
- Prepares `/var/www/html`

### 2️⃣ Clones the Laravel Control Panel

It clones:

https://github.com/peterconsuegra/pete-panel.git

Then:

- Checks out the latest Git tag
- Creates a fresh `.env`
- Injects Docker-specific environment values

Key injected values:

- DB_HOST=db
- DB_DATABASE=${PETE_DB_NAME}
- APACHE_RELOAD_URL
- APACHE_RELOAD_SECRET
- APACHE_CERTBOT_URL
- PETE_DASHBOARD_URL=https://dashboard.deploypete.com

---

## 🗄 Database & Laravel Bootstrapping

The script:

• Creates database + user  
• Creates `options` table  
• Runs Laravel migrations  
• Generates app key  
• Caches config and routes  

This prepares the control panel to manage:

- WordPress sites
- Apache vhosts
- SSL certificates
- Exports
- Logs
- Backups

---

## ⚙️ Docker → Laravel Communication

### 🔄 Apache Internal Reload

```
APACHE_RELOAD_URL=http://apache/internal-reload
```

Used when:

- Creating vhosts
- Enabling sites
- Updating Apache configs
- Requesting certificate generation

Authenticated via:

```
APACHE_RELOAD_SECRET
```

---

### 🔐 Security Integration

The installer runs:

```
Pete/scripts/toggle_security.sh
```

Development → security relaxed  
Production → security configurable  

---

## 🔑 SSH Key Automation

The script automatically:

- Generates SSH keys for `www-data`
- Generates SSH keys for `root`
- Preloads GitHub/Bitbucket known_hosts

This allows the control panel to:

- Clone private repositories
- Deploy Laravel projects
- Sync WordPress projects

---

## 🧠 System Metadata Registration

The installer stores Docker metadata inside the `options` table:

Examples:

- os = docker
- server = apache
- os_stack = apache_mpm_prefork
- server_conf = /etc/apache2/sites-available
- logs_route = /var/www/html/wwwlog

The Laravel control panel uses this to dynamically manage the environment.

---

## 🗄 phpMyAdmin Bootstrap

phpMyAdmin is installed automatically into the shared `pma_data` volume on first boot.

---

## 🚀 Runtime Mode

After installation:

```
exec php-fpm -F
```

Laravel now manages:

• Site creation  
• Apache vhost configs  
• Internal reload triggers  
• Backups and exports  
• WordPress + Laravel integrations  

---

# 🏗 Conceptual Architecture

Docker provides:

- Infrastructure
- Isolation
- Performance tuning

Laravel (Pete Panel) provides:

- Hosting control logic
- Site lifecycle management
- Dashboard integration
- Automation

Together they form:

👉 A portable hosting control panel running entirely inside Docker  
👉 A production-ready WordPress + Laravel hybrid stack  

---

For advanced workflows:

👉 https://deploypete.com/dev-playgrounds/



---

# 🔖 Development & Release Policy

Pete Panel follows a **stable-first release workflow** to keep production environments predictable and safe.

## Branching Strategy

- `main` branch always contains the **latest stable production-ready version**
- Experimental or in-progress features should never live directly in `main`
- Stable releases are validated before being pushed

## Release Flow

1. Develop and test changes
2. Validate stability locally and/or in staging
3. Push the stable version to the `main` branch
4. Create and push a Git tag for that version

Example:

```bash
git checkout main
git pull origin main
git tag v14.9
git push origin v14.9
```

## Why This Matters

The Docker installer (`pete_install.sh`) automatically checks out the **latest Git tag**:

```bash
latestTag=$(git describe --tags `git rev-list --tags --max-count=1`)
git checkout $latestTag
```

This ensures:

• The Docker environment always installs a **stable tagged release**  
• Production deployments remain deterministic  
• The `main` branch reflects the most recent stable code  
• Tags represent immutable release snapshots  

---

This policy guarantees that Docker environments, production servers, and DeployPete dashboard integrations always run verified stable builds.
