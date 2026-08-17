# OpenSign behind Nginx Proxy Manager

This deployment does not run Caddy. OpenSign is available on the Docker host at:

- `http://<opensign-host>:3000` for the web client
- `http://<opensign-host>:8080` for the API

Do not expose MongoDB publicly; it is kept on the private Docker network.

## DNS and firewall

1. Create an `A` record for `sign.innotel.us` pointing to the Nginx Proxy Manager server.
2. Allow the Nginx Proxy Manager server to reach TCP ports `3000` and `8080` on the OpenSign host.
3. Restrict ports `3000` and `8080` in the OpenSign host firewall to the Nginx Proxy Manager server's IP. Do not expose port `27017` or `27018`.

## Nginx Proxy Manager

Create a Proxy Host with:

- **Domain Names:** `sign.innotel.us`
- **Scheme:** `http`
- **Forward Hostname/IP:** the private IP or DNS name of the OpenSign host
- **Forward Port:** `3000`
- **Websockets Support:** enabled
- **SSL:** request a Let's Encrypt certificate for `sign.innotel.us` and enable **Force SSL**

Add a Custom Location for `/api/` that forwards to the same OpenSign host on port `8080`. In that location's **Advanced** field, add:

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

The rewrite is required because OpenSign's API listens at `/app`, while the public API URL is `/api/app`.

## Start or update OpenSign

From this directory, run:

```bash
docker compose pull
docker compose up -d
```

Check startup with:

```bash
docker compose ps
docker compose logs -f server client
```

The default configuration uses the persistent `opensign-files` volume for documents. Configure SMTP in `.env.prod` and recreate the containers before relying on email invitations or notifications.
