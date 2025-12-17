FROM nginx:alpine

# Needed only to generate a local self-signed cert automatically.
RUN apk add --no-cache openssl

# Ensure snippet dirs exist (some base images don't ship it).
RUN mkdir -p /etc/nginx/snippets /etc/nginx/certs

COPY deploy/nginx/edge.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/ssl-params.conf /etc/nginx/snippets/ssl-params.conf
COPY deploy/nginx/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
