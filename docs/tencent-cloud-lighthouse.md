# Tencent Cloud Lighthouse Deployment

This project runs well on a Tencent Cloud Lighthouse Ubuntu instance with Node.js, PM2, and Nginx.

## Recommended Server

- Image: Ubuntu 22.04 LTS
- Minimum: 2 vCPU, 2 GB RAM
- Recommended: 2 vCPU, 4 GB RAM
- Firewall ports: 22, 80, 443
- Project path used below: `/var/www/travel-planner`

## 1. Connect to the Server

Replace `SERVER_IP` with your Lighthouse public IP.

```bash
ssh ubuntu@SERVER_IP
```

If Tencent Cloud created a `root` user login for the image, use:

```bash
ssh root@SERVER_IP
```

## 2. Install Base Packages

```bash
sudo apt update
sudo apt install -y curl git nginx
```

## 3. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

`node -v` should print a Node 22 version.

## 4. Upload or Clone the Project

If the code is in a Git repository:

```bash
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
git clone YOUR_REPOSITORY_URL /var/www/travel-planner
cd /var/www/travel-planner
```

If you upload the folder manually, put this project directory at:

```txt
/var/www/travel-planner
```

## 5. Configure Environment Variables

Create the production environment file:

```bash
cd /var/www/travel-planner
cp .env.example .env.production
nano .env.production
```

Required values:

```txt
NEXT_PUBLIC_AMAP_KEY=your_amap_js_api_key
NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=your_amap_js_api_security_code
NEXT_PUBLIC_AMAP_WEB_KEY=your_amap_web_service_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

Production values:

```txt
DEEPSEEK_BASE_URL=https://api.deepseek.com
NEXTAUTH_SECRET=replace_with_a_long_random_string
NEXTAUTH_URL=https://your-domain.com
```

If you do not have a domain yet, use:

```txt
NEXTAUTH_URL=http://SERVER_IP
```

Optional:

```txt
XHS_MCP_URL=http://127.0.0.1:3456/mcp
```

Generate a random NextAuth secret:

```bash
openssl rand -base64 32
```

## 6. Install Dependencies and Build

```bash
npm ci
npm run build
```

## 7. Install and Start PM2

```bash
sudo npm install -g pm2
npm run pm2:start
pm2 save
pm2 startup systemd
```

After `pm2 startup systemd`, PM2 prints one command starting with `sudo env PATH=...`. Copy and run that printed command.

Useful PM2 commands:

```bash
pm2 status
pm2 logs travel-planner
npm run pm2:restart
```

## 8. Configure Nginx

Create the Nginx site:

```bash
sudo nano /etc/nginx/sites-available/travel-planner
```

Paste this config. Replace `your-domain.com` with your real domain. If you do not have a domain yet, use `_`.

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 130s;
        proxy_send_timeout 130s;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/travel-planner /etc/nginx/sites-enabled/travel-planner
sudo nginx -t
sudo systemctl reload nginx
```

Open:

```txt
http://SERVER_IP
```

or:

```txt
http://your-domain.com
```

## 9. Enable HTTPS After Domain DNS Works

Point your domain A record to the Lighthouse public IP first. Then install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Update `.env.production` after HTTPS is ready:

```txt
NEXTAUTH_URL=https://your-domain.com
```

Restart the app:

```bash
npm run pm2:restart
```

## 10. Future Updates

```bash
cd /var/www/travel-planner
git pull
npm ci
npm run build
npm run pm2:restart
```

## 11. Optional GitHub Actions Auto Deploy

The repository includes `.github/workflows/deploy.yml`. After setup, every push to `main` deploys to this server automatically.

Create a deploy SSH key on your local computer:

```bash
ssh-keygen -t ed25519 -C "github-actions-nomtrail" -f ~/.ssh/nomtrail_actions_deploy
```

Add the public key to the server:

```bash
cat ~/.ssh/nomtrail_actions_deploy.pub
```

Copy that output. On the server:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Paste the public key into `authorized_keys`.

Add these GitHub repository secrets:

```txt
DEPLOY_HOST=101.32.186.10
DEPLOY_USER=ubuntu
DEPLOY_PORT=22
DEPLOY_PATH=/var/www/travel-planner
DEPLOY_SSH_KEY=<contents of ~/.ssh/nomtrail_actions_deploy>
```

Get the private key value for `DEPLOY_SSH_KEY`:

```bash
cat ~/.ssh/nomtrail_actions_deploy
```

GitHub path:

```txt
Repository -> Settings -> Secrets and variables -> Actions -> New repository secret
```

After the secrets are set, push to `main` or run the workflow manually from:

```txt
Repository -> Actions -> Deploy to Server -> Run workflow
```

## Troubleshooting

Check the app:

```bash
pm2 logs travel-planner
```

Check Nginx:

```bash
sudo nginx -t
sudo tail -n 100 /var/log/nginx/error.log
```

Check whether Next.js is listening locally:

```bash
curl -I http://127.0.0.1:3000
```

If AI generation times out, keep `proxy_read_timeout` at `130s` or higher because the agent route can run for up to 120 seconds.
