# syntax=docker/dockerfile:1

# ---------- deps stage: install workspace deps + materialize static libs ----------
FROM node:24-alpine AS deps
WORKDIR /app

# Manifest-only layer first for better dependency-layer caching.
# NOTE: package-lock.json is intentionally NOT copied (it is gitignored); we use `npm install`.
COPY package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/web-framework/package.json ./packages/web-framework/
COPY packages/competence/package.json ./packages/competence/
COPY packages/tester/package.json ./packages/tester/

# Install runtime deps only, skipping lifecycle scripts (web-framework's postinstall needs source, copied next).
RUN npm install --omit=dev --ignore-scripts

# Copy the source of the packages the app needs at runtime (tester source is not needed).
COPY packages/core ./packages/core
COPY packages/web-framework ./packages/web-framework
COPY packages/competence ./packages/competence

# Now that web-framework source exists, run its postinstall to copy the bundled HTMX/Alpine static libs.
RUN npm run postinstall -w @ti-engine/web-framework

# ---------- runtime stage: minimal, non-root ----------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    TI_INSTANCE_NAME=ti-competence \
    TI_INSTANCE_CLASS=bin/competence-web-server.js \
    TI_INSTANCE_CONFIG=bin/competence-web-server.json \
    TI_LOCALIZATION_LABELS_PATH=bin/localization/competence-labels.json \
    TI_WEB_HOST=0.0.0.0 \
    TI_WEB_PORT=3000 \
    TI_WEB_USE_TLS=false \
    TI_WEB_AUTH_METHODS=openid-azure

WORKDIR /app
COPY --from=deps --chown=node:node /app /app

USER node
# The instance bootstrap resolves TI_INSTANCE_CLASS/CONFIG relative to cwd, so cwd must be the competence package dir.
WORKDIR /app/packages/competence
EXPOSE 3000

# Liveness probe: the framework's own, since every input it reads is the framework's — TI_WEB_USE_TLS, TI_WEB_PORT,
# TI_WEB_TLS_CERT_PATH and the /health route it calls. An inline one-liner here hardcoded http:// and reported a
# TLS-enabled container unhealthy forever; a copy of the probe would be the same mistake one step removed. Exec
# form, so no shell touches it. Path style matches the CMD below.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "/app/node_modules/@ti-engine/web-framework/bin/healthcheck.js"]

# @ti-engine/core is hoisted to /app/node_modules and symlinked to /app/packages/core.
CMD ["node", "/app/node_modules/@ti-engine/core/bin/start-instance.js"]
