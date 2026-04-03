# Nginx Configuration for Rumi

This directory contains the Nginx reverse proxy configuration for Rumi.

## Installation

1. Copy the configuration file to your server:
   ```bash
   sudo cp nginx/rumi.conf /etc/nginx/conf.d/rumi.conf
   ```

2. Update the `server_name` in the config file:
   ```bash
   sudo nano /etc/nginx/conf.d/rumi.conf
   # Change "rumi.website" to your actual domain
   ```

3. Test the configuration:
   ```bash
   sudo nginx -t
   ```

4. Reload Nginx:
   ```bash
   sudo systemctl reload nginx
   ```

## Endpoints

After deployment, the following endpoints will be available:

- **Rumi Frontend**: `https://your-domain.com/rumi/`
  - Main application interface
  - Proxies to `localhost:8888`

- **WeWeRSS Management**: `https://your-domain.com/wewerss/`
  - WeChat RSS feed management interface
  - Proxies to `localhost:4000`
  - Use this to configure WeChat public account subscriptions

## SSL Certificates

The configuration includes SSL certificate paths. Update these lines based on your setup:

### Option 1: Let's Encrypt (Certbot)
```nginx
ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
include             /etc/letsencrypt/options-ssl-nginx.conf;
ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;
```

### Option 2: Custom Certificates
```nginx
ssl_certificate     /etc/ssl/certs/your-domain.pem;
ssl_certificate_key /etc/ssl/certs/your-domain.key;
```

## Troubleshooting

### Check Nginx status
```bash
sudo systemctl status nginx
```

### View Nginx error logs
```bash
sudo tail -f /var/log/nginx/error.log
```

### Test backend connectivity
```bash
curl http://localhost:8888/health
curl http://localhost:4000
```

### Reload configuration after changes
```bash
sudo nginx -t && sudo systemctl reload nginx
