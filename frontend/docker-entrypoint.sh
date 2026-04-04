#!/bin/sh
set -e

# Read the nameserver from /etc/resolv.conf (works for both Docker and Podman)
RESOLVER=$(grep -m1 '^nameserver' /etc/resolv.conf | awk '{print $2}')
export RESOLVER

# Substitute ${RESOLVER} in the nginx config template
envsubst '${RESOLVER}' \
  < /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
