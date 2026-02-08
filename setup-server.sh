#!/bin/bash
set -e

echo "=== Setting up server for deployment ==="

# Update system
apt-get update

# Install docker-compose
echo "Installing docker-compose..."
apt-get install -y docker-compose

# Install other useful tools
apt-get install -y git curl nano

# Verify installations
echo ""
echo "=== Verification ==="
docker --version
docker-compose --version
git --version

echo ""
echo "=== Setup complete! ==="
echo "Now run: git clone https://github.com/edavidk7/hacknation26.git"
