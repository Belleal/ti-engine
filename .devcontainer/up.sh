#!/usr/bin/env bash
# Codespaces / Dev Containers startup for the competence TEST/DEMO stack.
# Waits for the docker-in-docker daemon, trusts the forwarded origin (Codespaces), then starts the compose stack.
set -euo pipefail

# The docker-in-docker daemon starts asynchronously; wait (bounded to 90s) for it to accept connections.
timeout 90 sh -c 'until docker info >/dev/null 2>&1; do echo "waiting for docker daemon..."; sleep 2; done'

# In a Codespace the app is reached via a port-forwarding proxy that does not present the external host to the
# container, so the app's CSRF Origin/Referer check would reject login POSTs. Trust the forwarded origin explicitly,
# built from the documented Codespaces variables. GitHub advises against hardcoding the forwarding domain (it can
# change), so require GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN rather than assuming a default.
if [ -n "${CODESPACE_NAME:-}" ]; then
    if [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
        export TI_WEB_TRUSTED_ORIGINS="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
        echo "Trusting Codespaces origin: ${TI_WEB_TRUSTED_ORIGINS}"
    else
        echo "WARNING: CODESPACE_NAME is set but GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN is empty; not setting TI_WEB_TRUSTED_ORIGINS. Login via the forwarded port may fail with an origin mismatch until you set TI_WEB_TRUSTED_ORIGINS to your Codespace URL." >&2
    fi
fi

docker compose up -d --build
echo "competence is starting on port 3000. Stream logs with:  docker compose logs -f competence"
