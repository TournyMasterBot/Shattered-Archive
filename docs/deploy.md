# Deployment & Docker Internals

This document explains **how deployment works internally** in the
ShatteredArchive repository, including Docker Compose, certificates,
Dockerfiles, and nginx routing.

---

## 1. Docker Compose

**File:** `deploy/docker-compose.yml`

Docker Compose is responsible for:

- Creating a shared bridge network
- Starting all services
- Providing stable DNS names
- Mounting configuration and certificates
- Exposing nginx to the host

### Service Naming

Each service name becomes a DNS hostname:

```text
game-client  -> http://game-client
web-client   -> http://web-client
game-server  -> http://game-server
web-server   -> http://web-server
```

nginx relies on these names when proxying traffic.

---

## 2. Local Domain & Hosts Setup

The project uses `.dev` subdomains for realism and isolation.

Examples:

- `game-client.shatteredarchive.dev`
- `web-server.shatteredarchive.dev`

A one‑time script updates the system hosts file so these domains resolve
to `127.0.0.1`.

Docker itself is **not involved** in DNS resolution on the host.

---

## 3. TLS Certificates

Certificates are created **outside Docker** using `mkcert`.

### Why mkcert?

- Trusted by the local OS/browser
- No warnings
- No runtime certificate generation
- No ACME / Let's Encrypt complexity

### Certificate Flow

```text
mkcert (host)
  |
  v
deploy/nginx/certs/*.pem
  |
  v
mounted read‑only into nginx container
```

nginx simply loads the files at startup.

---

## 4. Dockerfiles

### Clients

Client Dockerfiles use a **two‑stage build**:

1. Node build stage
   - installs dependencies
   - builds the SPA
2. nginx runtime stage
   - serves static files on port 80

The client containers **do not expose ports to the host**.

---

### Servers

Server Dockerfiles:

- Build all workspace dependencies once
- Copy compiled output into a runtime image
- Start Node directly

Environment variables control ports, logging, and TLS behavior.

---

## 5. nginx Edge Configuration

**File:** `deploy/nginx/edge-subdomains.conf`

Responsibilities:

- Redirect HTTP → HTTPS
- Terminate TLS
- Route requests by `server_name`
- Proxy WebSockets

Example routing logic:

```nginx
server_name game-client.shatteredarchive.dev;
proxy_pass http://game-client;
```

nginx talks to containers **only over the Docker network**.

---

## 6. Ports & Exposure

| Component | Exposed to Host |
|---------|-----------------|
| nginx | 80, 443 |
| clients | no |
| servers | no |

All external traffic flows through nginx.

---

## 7. Common Failure Modes

| Symptom | Likely Cause |
|-------|--------------|
| 502 Bad Gateway | Wrong internal port |
| TLS error | Cert path mismatch |
| Connection closed | nginx upstream unreachable |
| Styling missing | stale client build |
| Host resolves, no response | nginx not listening |

---

## 8. Mental Model

- **Dockerfiles** build images
- **Compose** wires them together
- **mkcert** handles trust
- **nginx** is the only door in or out

---

## Recommended Workflow

```text
pnpm setup:hosts
pnpm setup:certs
docker compose up --build
```

After initial setup, day‑to‑day usage is typically just:

```text
docker compose up
```

---
