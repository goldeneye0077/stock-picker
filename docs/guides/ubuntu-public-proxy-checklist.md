# Ubuntu Public Proxy Checklist

This project already handles `/api`, `/data-service/`, and `/ws` correctly inside the frontend container via `frontend/nginx.conf`. If an Ubuntu host-level Nginx sits in front of that container, it must preserve the same routing and websocket upgrade behavior.

## Known failure signals

- `logo.png` returns `ERR_CONTENT_LENGTH_MISMATCH`
- `ws://<host>/ws` fails and the backend responds with `Route GET /ws not found`
- The deploy pipeline reports healthy containers, but the public site is still broken

## Recommended host Nginx shape

```nginx
server {
    listen 80;
    server_name awebi.cn www.awebi.cn;

    location / {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /data-service/ {
        proxy_pass http://127.0.0.1:8001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Public checks

Run this from any machine that can reach the site:

```bash
node scripts/ops/verify_public_endpoints.js http://awebi.cn
```

The script fails when:

- `/logo.png` truncates or returns a mismatched `Content-Length`
- `/api/auth/me` does not behave like a protected endpoint
- `/ws` does not return `101 Switching Protocols`

## Host-side quick commands

```bash
curl -I http://awebi.cn/logo.png
curl -i http://awebi.cn/api/auth/me
curl --http1.1 -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://awebi.cn/ws
```

Expected results:

- `logo.png` downloads fully with no curl transfer error
- `/api/auth/me` returns `401` and `code=UNAUTHORIZED`
- `/ws` returns `101 Switching Protocols`
