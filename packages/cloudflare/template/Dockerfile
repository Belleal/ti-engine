# The application's container image, run by Cloudflare behind @ti-engine/cloudflare's Worker. From the package's
# template: the names to change are in its README.
#
# Nothing secret goes in the image. Settings and secrets reach the container from the Worker's bindings, through the
# container class's `envVars`, as each container starts.

FROM node:24-alpine AS dependencies
WORKDIR /app

# The manifests alone, so a change to the code does not rebuild the dependency layer. `npm ci` installs exactly what
# the lockfile pins, and fails when the lockfile and the manifest disagree. Without dev dependencies: wrangler,
# `@cloudflare/containers` and `@ti-engine/cloudflare` belong to the Worker, never to the container.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-alpine
WORKDIR /app

# What core's `start-instance.js` starts: the application's service class and its configuration, relative to the
# working directory. Neither varies between deployments, and neither is secret.
ENV NODE_ENV=production \
    TI_INSTANCE_NAME=ti-application \
    TI_INSTANCE_CLASS=web-server.js \
    TI_INSTANCE_CONFIG=web-server.json

COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node . .

# Unprivileged: the image defines `node` already.
USER node

# The port the container class's `defaultPort` names, and the platform's `TI_WEB_PORT`. A mismatch fails at the first
# request, not at deploy.
EXPOSE 3000

# web-framework's own liveness probe: it reads the same settings the server does, so it cannot disagree with it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD [ "node", "node_modules/@ti-engine/web-framework/bin/healthcheck.js" ]

CMD [ "node", "node_modules/@ti-engine/core/bin/start-instance.js" ]
