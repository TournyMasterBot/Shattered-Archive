# Deployment Documentation

This directory contains step-by-step guides for deploying
**Shattered Archive** on an Ubuntu VPS using Docker.

These guides are written for **hobbyists** and assume minimal DevOps experience.

---

## Setup Order (Follow in This Order)

### 1. Ubuntu Base Setup
➡️ [ubuntu-setup.md](./ubuntu-setup.md)

### 2. Docker Configuration
➡️ [docker-setup.md](./docker-setup.md)

### 3. Repository & Services
➡️ [repo-setup.md](./repo-setup.md)

---

## What This Deploys

- Edge NGINX with HTTPS
- Game Client
- Web Client
- Game Server
- Web Server

All services are managed via **Docker Compose**.

---

## Notes

- TLS certificates generated here are **development certificates**
- Browsers will warn unless you manually trust the CA
- Intended for hobby or personal hosting
