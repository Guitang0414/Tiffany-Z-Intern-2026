# Production image: official Directus + our compiled extensions.
#
# Why a Dockerfile instead of committing dist/ (deployment-plan §4.1.7 suggested
# committing build artifacts): building the extensions here guarantees prod always
# matches source — no risk of a stale committed dist/ silently running old code.
# Host-provided deps (@directus/errors, vue, @directus/extensions-sdk) are externalized,
# so the extensions need no node_modules baked in.

# --- build articles-hooks (API extension: lifecycle hooks) ---
FROM node:18-alpine AS build-hooks
WORKDIR /build
COPY extensions/articles-hooks/package.json extensions/articles-hooks/package-lock.json ./
RUN npm ci
COPY extensions/articles-hooks/ ./
RUN npm run build

# --- build article-review-actions (App extension: editor review interface) ---
FROM node:18-alpine AS build-review
WORKDIR /build
COPY extensions/article-review-actions/package.json extensions/article-review-actions/package-lock.json ./
RUN npm ci
COPY extensions/article-review-actions/ ./
RUN npm run build

# --- final image ---
FROM directus/directus:11.17.4
COPY --from=build-hooks /build/package.json /directus/extensions/articles-hooks/package.json
COPY --from=build-hooks /build/dist /directus/extensions/articles-hooks/dist
COPY --from=build-review /build/package.json /directus/extensions/article-review-actions/package.json
COPY --from=build-review /build/dist /directus/extensions/article-review-actions/dist
