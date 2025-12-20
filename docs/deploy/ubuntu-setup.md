# Ubuntu Setup

This guide prepares a **fresh Ubuntu VPS** with everything needed to install
Docker safely from Docker’s official repositories.

You only need to do this once per server.

---

## Update the system

These commands ensure your system packages are fully up to date before installing anything new.

```bash
sudo apt-get update
sudo apt-get -y upgrade
```

---

## Install prerequisite packages

These are required to:
- securely download files over HTTPS
- manage cryptographic keys
- identify your Ubuntu version correctly

```bash
sudo apt-get install -y ca-certificates curl gnupg lsb-release
```

---

## Add Docker’s official GPG key

Docker signs its packages. This step allows Ubuntu to verify Docker downloads
haven’t been tampered with.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

---

## Add Docker’s official package repository

This tells Ubuntu **where** to download Docker from and ensures you receive
official updates.

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Update package listings again so Ubuntu sees the new Docker repo:

```bash
sudo apt-get update
```

---

## Install Docker Engine and Docker Compose

This installs:
- Docker Engine (the container runtime)
- Docker Compose (used to start the Shattered Archive stack)

```bash
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

# Next
[Setup Docker](./docker-setup.md)