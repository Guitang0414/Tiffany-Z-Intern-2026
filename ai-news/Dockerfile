# Production image: official Directus + our compiled articles-hooks extension.
#
# Why a Dockerfile instead of committing dist/ (deployment-plan §4.1.7 suggested
# committing build artifacts): building the extension here guarantees prod always
# matches source — no risk of a stale committed dist/ silently running an old hook.
# @directus/errors is externalized (provided by the Directus host at runtime), so the
# extension needs no node_modules baked in.

# --- build the extension ---
FROM node:18-alpine AS build
WORKDIR /build
COPY extensions/articles-hooks/package.json extensions/articles-hooks/package-lock.json ./
RUN npm ci
COPY extensions/articles-hooks/ ./
RUN npm run build

# --- final image ---
FROM directus/directus:11.17.4
COPY --from=build /build/package.json /directus/extensions/articles-hooks/package.json
COPY --from=build /build/dist /directus/extensions/articles-hooks/dist
