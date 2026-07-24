#!/usr/bin/env bash
# Codespaces / Dev Containers startup for the competence TEST/DEMO stack.
# Waits for the docker-in-docker daemon, trusts the forwarded origin (Codespaces), then starts the compose stack.
set -euo pipefail

# The docker-in-docker daemon starts asynchronously; wait (bounded to 90s) for it to accept connections.
timeout 90 sh -c 'until docker info >/dev/null 2>&1; do echo "waiting for docker daemon..."; sleep 2; done'

# In a Codespace the app's CSRF Origin/Referer check would reject login POSTs, because the browser origin does not
# match the origin the container reconstructs from the forwarded headers. There are two access paths, so trust both:
#   - http(s)://localhost:3000 — VS Code tunnels the forwarded port to localhost on your machine, so the browser
#     sends this Origin even though the request reaches the container as the *.app.github.dev forwarded host;
#   - the public https://<name>-3000.<domain> origin — used when you open the app via the forwarded-port URL directly.
# GitHub advises against hardcoding the forwarding domain (it can change), so only add the public origin when
# GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN is provided.
if [ -n "${CODESPACE_NAME:-}" ]; then
    trusted="http://localhost:3000,https://localhost:3000"
    if [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
        trusted="${trusted},https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    else
        echo "WARNING: GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN is empty; trusting only the localhost origins. If you open the app via the *.app.github.dev URL, set TI_WEB_TRUSTED_ORIGINS to that origin." >&2
    fi
    export TI_WEB_TRUSTED_ORIGINS="${trusted}"
    echo "Trusting origins: ${TI_WEB_TRUSTED_ORIGINS}"
fi

docker compose up -d --build
echo "competence is starting on port 3000. Stream logs with:  docker compose logs -f competence"
