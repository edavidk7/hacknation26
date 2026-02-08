#!/bin/bash
set -e

echo "=== HackNation Deployment Script ==="

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Please create .env with:"
    echo "  OPENROUTER_API_KEY=your_key"
    echo "  ACESTEP_API_URL=your_url"
    echo "  ACESTEP_API_USER=your_user"
    echo "  ACESTEP_API_PASS=your_pass"
    exit 1
fi

# Load environment variables
export $(cat .env | xargs)

# Initial SSL certificate setup (first time only)
if [ ! -d "./certbot/conf/live/ruben-multimodal-composer.ai" ]; then
    echo "=== Setting up SSL certificates ==="
    
    # Start nginx temporarily for certbot
    docker-compose up -d nginx
    
    # Get certificate
    docker-compose run --rm certbot certonly \
        --webroot \
        --webroot-path /var/www/certbot \
        --email your-email@example.com \
        --agree-tos \
        --no-eff-email \
        -d ruben-multimodal-composer.ai
    
    # Restart nginx with SSL
    docker-compose restart nginx
fi

echo "=== Building and starting services ==="
docker-compose down
docker-compose build --no-cache
docker-compose up -d

echo "=== Deployment complete! ==="
echo "Site: https://ruben-multimodal-composer.ai"
echo ""
echo "Check logs with: docker-compose logs -f"
echo "Stop with: docker-compose down"
