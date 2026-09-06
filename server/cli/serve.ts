import { loadConfig } from "../config.ts";
import { buildApplication } from "../application/app.ts";
import { createHttpServer } from "../api/httpServer.ts";

const config = loadConfig();
const app = buildApplication(config);
await app.initialize();
const server = createHttpServer(app);
server.listen(config.port, config.host, () => {
  process.stdout.write(`bowling-api listening on ${config.host}:${config.port}\n`);
});