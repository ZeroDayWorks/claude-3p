FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/google-auth/package.json ./packages/google-auth/
COPY services/maps-mcp/package.json ./services/maps-mcp/
RUN npm ci --workspace=maps-mcp-server
COPY packages/google-auth/ ./packages/google-auth/
COPY services/maps-mcp/tsconfig.json ./services/maps-mcp/
COPY services/maps-mcp/src ./services/maps-mcp/src
RUN npm run build --workspace=maps-mcp-server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/google-auth/package.json ./packages/google-auth/
COPY services/maps-mcp/package.json ./services/maps-mcp/
RUN npm ci --workspace=maps-mcp-server --omit=dev && npm cache clean --force
COPY --from=build /app/services/maps-mcp/dist ./services/maps-mcp/dist
USER node
EXPOSE 3000
CMD ["node", "services/maps-mcp/dist/http.js"]
