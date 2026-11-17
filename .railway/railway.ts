import { defineRailway, group, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("floats-web", {
    build: "npm install && npm --prefix apps/web install && npm --prefix apps/web run build",
    start: "npm --prefix apps/web run start -- --hostname 0.0.0.0 --port $PORT",
    healthcheck: "/",
    healthcheckTimeout: 120,
    replicas: 1,
  });

  const api = service("floats-api", {
    build: "npm install",
    start: "npm run start:api",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: 1,
  });

  const indexer = service("floats-indexer", {
    build: "npm install",
    start: "npm run start:indexer",
    replicas: 1,
  });

  return project("Floats", {
    resources: [web, group("Backend", [api, indexer])],
  });
});
