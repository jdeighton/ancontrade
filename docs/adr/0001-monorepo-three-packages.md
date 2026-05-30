# Three-package monorepo: server, client, shared

The repo is structured as an npm workspaces monorepo with three packages: `packages/server` (Node.js back end), `packages/client` (React/Vite front end), and `packages/shared` (TypeScript types shared between both). The shared package is the primary motivation — REST request/response shapes and WebSocket event types are defined once and imported by both server and client, making the contract between them compiler-enforced rather than kept in sync by convention.
