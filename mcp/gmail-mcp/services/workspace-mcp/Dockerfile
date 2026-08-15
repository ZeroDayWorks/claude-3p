FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/google-auth/package.json ./packages/google-auth/
COPY services/workspace-mcp/package.json ./services/workspace-mcp/
RUN npm ci --workspace=workspace-mcp-server
COPY packages/google-auth/ ./packages/google-auth/
COPY services/workspace-mcp/tsconfig.json ./services/workspace-mcp/
COPY services/workspace-mcp/src ./services/workspace-mcp/src
RUN npm run build --workspace=workspace-mcp-server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/google-auth/package.json ./packages/google-auth/
COPY services/workspace-mcp/package.json ./services/workspace-mcp/
RUN npm ci --workspace=workspace-mcp-server --omit=dev && npm cache clean --force
COPY --from=build /app/services/workspace-mcp/dist ./services/workspace-mcp/dist
USER node
EXPOSE 3000
CMD ["node", "services/workspace-mcp/dist/http.js"]
