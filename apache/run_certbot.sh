#!/bin/bash
set -e

# Define domain and email for Certbot (template domain for testing purposes)
DOMAIN="demo.example.com"  # Replace with your placeholder domain
EMAIL="your-email@example.com"

# Run Certbot to obtain the certificate for the placeholder domain
echo "Running Certbot to obtain SSL certificate for $DOMAIN"

# Use --staging to avoid rate limits during testing
certbot --staging --apache --non-interactive --agree-tos --email $EMAIL -d $DOMAIN -d www.$DOMAIN

echo "Certbot has successfully obtained the SSL certificate for $DOMAIN"
