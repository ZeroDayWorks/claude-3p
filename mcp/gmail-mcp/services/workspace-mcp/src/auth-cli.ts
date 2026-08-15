#!/usr/bin/env node
import { runAuthFlow } from "@google-workspace/auth";
import { loadConfig } from "./config.js";

const config = loadConfig();
runAuthFlow({
  credentialsPath: config.credentialsPath,
  tokenPath: config.tokenPath,
  scopes: config.scopes,
  serviceName: config.serviceName,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
