# Sign Platform

Self-hosted OpenSign deployment for `sign.innotel.us`, using Docker Compose and an external Nginx Proxy Manager instance.

## Features

- OpenSign web client and API using the official Docker images
- MongoDB with persistent Docker storage
- Persistent document storage on the `opensign-files` volume
- No Caddy container
- External HTTPS termination and routing through Nginx Proxy Manager
- API routing from `/api/app` to OpenSign's internal `/app` endpoint

## Requirements

- Docker Engine with Docker Compose
- A server reachable by Nginx Proxy Manager
- A DNS `A` record for `sign.innotel.us` pointing to the Nginx Proxy Manager server
- Firewall access from Nginx Proxy Manager to TCP ports `3000` and `8080` on the OpenSign host
- MongoDB 7.0 image (`mongo:7.0`). The image is pinned because `mongo:latest` (MongoDB 8.x) fails to start on Linux kernels 6.19+ (known incompatibility, [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)) and requires AVX CPU support

## Quick start

Create the private environment file from the deployment settings, then start the stack:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

The local endpoints are:

- Web client: `http://<opensign-host>:3000`
- API: `http://<opensign-host>:8080`

Do not expose MongoDB to the public internet.

## Nginx Proxy Manager

Create a Proxy Host for `sign.innotel.us` forwarding to the OpenSign host on port `3000`. Enable Websockets and configure a Let's Encrypt certificate with Force SSL.

Add a custom location for `/api/` forwarding to port `8080`, with this Advanced configuration:

```nginx
rewrite ^/api/(.*)$ /$1 break;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
client_max_body_size 100m;
proxy_read_timeout 100s;
proxy_send_timeout 100s;
```

See [NGINX_PROXY_MANAGER.md](NGINX_PROXY_MANAGER.md) for the complete proxy, DNS, and firewall setup.

## Configuration

The deployment uses a private `.env.prod` file, which is intentionally ignored by Git. The configured public values are:

```text
PUBLIC_URL=https://sign.innotel.us
REACT_APP_SERVERURL=https://sign.innotel.us/api/app
SERVER_URL=https://sign.innotel.us/api/app
MONGODB_URI=mongodb://mongo:27017/OpenSignDB
PARSE_MOUNT=/app
USE_LOCAL=true
```

SMTP is disabled by default. Configure SMTP credentials in `.env.prod` before using email invitations or notifications.

Never commit `.env.prod`, `MASTER_KEY`, SMTP credentials, storage credentials, or signing certificates.

## Operations

```bash
# Update images and recreate changed services
docker compose pull
docker compose up -d

# View service status
docker compose ps

# Follow application logs
docker compose logs -f server client

# Stop the stack without deleting volumes
docker compose down
```

The named volumes `data-volume` and `opensign-files` contain application data. Do not run `docker compose down -v` unless you intend to delete that data.

## Upstream project

This project packages deployment configuration around [OpenSign](https://github.com/OpenSignLabs/OpenSign), an AGPL-3.0 licensed open-source document signing platform. OpenSign source, trademarks, and licensing remain with OpenSignLabs.

## License

Deployment configuration in this repository is provided under the same AGPL-3.0 license as the upstream OpenSign project. See [LICENSE](LICENSE).
