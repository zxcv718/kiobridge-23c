# Single image for the whole monorepo. Each compose service overrides the command.
# .dockerignore keeps node_modules / dist / __MACOSX / private data out of the
# build context, so `COPY . .` stays clean and reproducible.
FROM node:22-bookworm-slim

LABEL org.opencontainers.image.title="KioBridge Simulation Kit" \
      org.opencontainers.image.version="5.1.4" \
      org.opencontainers.image.description="SIMULATION_ONLY kiosk digital twin. inputContractVersion=1.0.0" \
      io.kiobridge.product-version="5.1.4" \
      io.kiobridge.input-contract-version="1.0.0"

WORKDIR /app

# Copy every workspace manifest first so `npm ci` can be cached independently of
# source changes. Uses a glob so adding a workspace does not break the build.
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY examples/ ./examples/

# Reproducible install from the lockfile.
RUN npm ci

# Remaining source (schemas, environments, tools, tests, docs).
COPY . .

EXPOSE 3000 4000

# Overridden per-service in compose.yaml.
CMD ["npm", "run", "dev"]
