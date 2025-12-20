# Docker Setup

This guide finishes configuring Docker after installation and ensures it
starts automatically and is accessible to your user.

---

## Pre-requisites

Make sure you completed:
- [Ubuntu Setup](./ubuntu-setup.md)

---

## Verify Docker installation

These commands confirm Docker and Docker Compose are installed correctly.

```bash
docker --version
docker compose version
```

---

## Allow your user to run Docker commands

By default, Docker requires `sudo`.  
This step allows your user to run Docker normally.

```bash
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

> If `docker ps` works without sudo, this step succeeded.

---

## Start Docker automatically on boot

Ensures Docker starts after server reboots.

```bash
sudo systemctl enable --now docker
```

---

## Configure firewall (UFW)

These rules allow:
- SSH access (so you don’t lock yourself out)
- HTTP (port 80)
- HTTPS (port 443)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

# Next
[Setup the Repository](./repo-setup.md)