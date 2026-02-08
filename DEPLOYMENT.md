# Deployment Instructions

## Droplet Information
- **IP**: 157.230.208.203
- **Domain**: ruben-multimodal-composer.ai (DNS configured)
- **Size**: 2 vCPU, 4GB RAM

## Quick Deploy

### 1. SSH into the droplet
```bash
# Get root password from DigitalOcean console or use SSH key
ssh root@157.230.208.203
```

### 2. Clone the repository
```bash
cd /root
git clone https://github.com/edavidk7/hacknation26.git
cd hacknation26
```

### 3. Create .env file
```bash
cp .env.production.example .env
nano .env  # Fill in your API keys
```

### 4. Run deployment
```bash
./deploy.sh
```

## Manual Deployment Steps

If the script doesn't work, do this manually:

```bash
# Install docker-compose if needed
apt-get update
apt-get install -y docker-compose

# Build and run
docker-compose build
docker-compose up -d

# Check logs
docker-compose logs -f

# SSL Certificate (after services are running)
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path /var/www/certbot \
    --email your-email@example.com \
    --agree-tos \
    -d ruben-multimodal-composer.ai

# Restart nginx after cert
docker-compose restart nginx
```

## Useful Commands

```bash
# View logs
docker-compose logs -f

# View specific service
docker-compose logs -f api

# Restart services
docker-compose restart

# Stop everything
docker-compose down

# Rebuild after code changes
git pull
docker-compose build
docker-compose up -d
```

## Troubleshooting

### Can't connect to droplet
- Get the root password from DigitalOcean console
- Or add your SSH key: `doctl compute droplet-action enable-ssh-key ...`

### Build fails
- Check if there's enough disk space: `df -h`
- Check Docker logs: `docker-compose logs`

### Domain not working
- Wait 5-10 minutes for DNS propagation
- Check DNS: `dig ruben-multimodal-composer.ai`
- Verify: `curl -I http://157.230.208.203`
