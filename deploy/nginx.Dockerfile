FROM nginx:alpine

# Needed only to generate a local self-signed cert automatically.
RUN apk add --no-cache openssl logrotate tzdata

# Ensure snippet dirs exist (some base images don't ship it).
RUN mkdir -p /etc/nginx/snippets /etc/nginx/includes /etc/nginx/certs /var/lib/logrotate /var/log/nginx

# Nginx config + ssl snippet
COPY deploy/nginx/edge.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/ssl-params.conf /etc/nginx/snippets/ssl-params.conf

# NEW: conditional include files used by edge-subdomains.conf template
COPY deploy/nginx/includes/tls-dev.conf /etc/nginx/includes/tls-dev.conf
COPY deploy/nginx/includes/tls-off.conf /etc/nginx/includes/tls-off.conf

# Logrotate config
COPY deploy/nginx/logrotate-nginx.conf /etc/logrotate.d/nginx
COPY deploy/nginx/crontab-root /etc/crontabs/root

# Entrypoint (cert generation + start cron)
COPY deploy/nginx/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh /etc/crontabs/root /etc/logrotate.d/nginx && \
    chmod +x /entrypoint.sh
RUN chmod 0644 /etc/logrotate.d/nginx
RUN chmod +x /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]