# Repository Setup

This guide:
- installs Node via NVM
- clones the Shattered Archive repository
- generates development TLS certificates
- starts the Docker stack

---

## Pre-requisite

Make sure Docker is installed and configured:
- [Docker Setup](./docker-setup.md)

---

## Install NVM (Node Version Manager)

NVM allows different Node versions without affecting the system.

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

Load NVM into the current shell:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

Install the required Node version:

```bash
nvm install 22.21.1
```

---

## Clone the repository

This downloads the Shattered Archive source code.

```bash
sudo apt-get install -y git
mkdir -p ~/src
cd ~/src
git clone https://github.com/TournyMasterBot/Shattered-Archive shatteredarchive
cd shatteredarchive
git status
```

---

## Install PNPM

PNPM is used to manage dependencies across the monorepo.

```bash
corepack enable
pnpm -v
```

When prompted, confirm with:

```text
y
```

---

## Install OpenSSL and generate certificates

These certificates allow HTTPS locally using a **development Certificate Authority**.

```bash
sudo apt-get install -y openssl
cd ~/src/shatteredarchive
cd deploy/nginx/certs
```

### Create a local CA

```bash
openssl genrsa -out ca.key 4096
```

```bash
openssl req -x509 -new -nodes \
  -key ca.key \
  -sha256 \
  -days 3650 \
  -out ca.pem \
  -subj "/C=US/ST=NA/L=NA/O=ShatteredArchive/OU=DevCA/CN=ShatteredArchive Dev CA"
```

### Create server key

```bash
openssl genrsa -out shatteredarchive.dev-key.pem 4096
```

### Define certificate SANs (domains)

```bash
cat > shatteredarchive.dev.ext <<'EOF'
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1=shatteredarchive.dev
DNS.2=*.shatteredarchive.dev
EOF
```

### Generate CSR

```bash
openssl req -new \
  -key shatteredarchive.dev-key.pem \
  -out shatteredarchive.dev.csr \
  -subj "/C=US/ST=NA/L=NA/O=ShatteredArchive/OU=Dev/CN=shatteredarchive.dev"
```

### Sign certificate

```bash
openssl x509 -req \
  -in shatteredarchive.dev.csr \
  -CA ca.pem \
  -CAkey ca.key \
  -CAcreateserial \
  -out shatteredarchive.dev.pem \
  -days 825 \
  -sha256 \
  -extfile shatteredarchive.dev.ext
```

### Secure certificate files

```bash
chmod 600 ca.key shatteredarchive.dev-key.pem
chmod 644 ca.pem shatteredarchive.dev.pem
```

---

## Trust the certificate authority

```bash
sudo cp ca.pem /usr/local/share/ca-certificates/shatteredarchive-dev-ca.crt
```

---

## Start the services

```bash
cd ~/src/shatteredarchive/deploy
docker compose build
docker compose up -d
```

## Finally
Open a web browser to your servers domain name / IP to play the game