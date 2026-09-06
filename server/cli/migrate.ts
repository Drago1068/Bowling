import { loadConfig } from "../config.ts";
import { buildApplication } from "../application/app.ts";

const app = buildApplication(loadConfig());
await app.initialize();
process.stdout.write("migrations complete\n");
await app.close();