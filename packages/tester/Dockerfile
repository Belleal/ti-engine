# syntax=docker/dockerfile:1

# The framework's own composition check. `tester` is a working ServiceProvider built on @ti-engine/core,
# so building it proves the packages in this repository still assemble into a bootable service — the
# regression class unit tests cannot see.
#
# It replaces the competence image as CI's docker-build target (CA-120). Be aware of what that costs:
# competence exercised core AND web-framework, including the Express/auth tier and the static-asset
# postinstall. `tester` exercises core only. The web tier now has no container-level coverage in this
# repository; recovering it would take a minimal web-framework smoke app, which is tracked separately.

# ---------- deps stage ----------
FROM node:24-alpine AS deps
WORKDIR /app

# Manifest-only layer first, for dependency-layer caching. package-lock.json is deliberately not copied:
# it is gitignored in this repository, which publishes libraries rather than a pinned image.
COPY package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/tester/package.json ./packages/tester/

RUN npm install --omit=dev --ignore-scripts --workspace @ti-engine/tester --include-workspace-root

COPY packages/core ./packages/core
COPY packages/tester ./packages/tester

# ---------- runtime stage: minimal, non-root ----------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    TI_INSTANCE_NAME=ti-tester-service \
    TI_INSTANCE_CLASS=bin/tester-service.js \
    TI_INSTANCE_CONFIG=bin/tester-service.json \
    TI_LOCALIZATION_LABELS_PATH=bin/more-labels.json

WORKDIR /app
COPY --from=deps --chown=node:node /app /app

USER node
# The instance bootstrap resolves TI_INSTANCE_CLASS/CONFIG relative to cwd.
WORKDIR /app/packages/tester

# No HEALTHCHECK: tester serves no HTTP port. The framework's probe belongs to web-framework, and this
# image exists to prove the build composes, not to be operated.
CMD ["node", "/app/node_modules/@ti-engine/core/bin/start-instance.js"]
