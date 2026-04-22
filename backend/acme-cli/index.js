#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readPomConfig } from "./lib/config.js";
import logger from "./lib/logger.js";
import { deployCertificate, shouldRenewByExpiry } from "./lib/certs.js";
import { issueCertificate, renewCertificate, validateRuntime } from "./lib/certbot.js";
import { readState, writeState } from "./lib/state.js";

const defaultConfigPath = path.resolve(process.cwd(), "pom.xml");

const parseArgs = (argv) => {
const opts = {
config: defaultConfigPath,
};

	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--config") {
			const value = argv[i + 1];
			if (!value) {
				throw new Error("--config requires a file path");
			}
			opts.config = path.resolve(value);
			i += 1;
		}
	}

return opts;
};

const usage = () => {
console.log("Usage: node acme-cli/index.js <validate|issue|renew|daemon> [--config /abs/path/pom.xml]");
};

const buildState = async (config, action, details = {}) => {
const current = await readState(config.stateFile);
return {
...current,
updatedAt: new Date().toISOString(),
lastAction: action,
configPath: config.configPath,
cert: {
alias: config.certAlias,
name: config.certName,
domains: config.domains,
outputDir: config.outputDir,
...details,
},
};
};

const executeIssue = async (config) => {
await issueCertificate(config);
const deployed = await deployCertificate(config);
const next = await buildState(config, "issued", {
expiresAt: deployed.expiresAt.toISOString(),
certFile: deployed.certFile,
keyFile: deployed.keyFile,
sourceDir: deployed.sourceDir,
});
await writeState(config.stateFile, next);
logger.success(`Certificate issued and deployed to ${deployed.certFile}`);
};

const executeRenew = async (config) => {
const certFile = path.join(config.outputDir, `${config.certAlias}.crt`);
const check = await shouldRenewByExpiry(certFile, config.renewBeforeDays);
logger.info(`Renewal check: ${check.reason}`);

if (!check.shouldRenew) {
const next = await buildState(config, "renew-skip", {
expiresAt: check.expiresAt?.toISOString() || null,
reason: check.reason,
});
await writeState(config.stateFile, next);
logger.success("Renew skipped: current certificate is still valid");
return;
}

if (check.expiresAt === null) {
logger.info("No deployed certificate found, issuing a new certificate");
await executeIssue(config);
return;
}

await renewCertificate(config);
const deployed = await deployCertificate(config);
const next = await buildState(config, "renewed", {
expiresAt: deployed.expiresAt.toISOString(),
certFile: deployed.certFile,
keyFile: deployed.keyFile,
sourceDir: deployed.sourceDir,
});
await writeState(config.stateFile, next);
logger.success(`Certificate renewed and deployed to ${deployed.certFile}`);
};

const executeDaemon = async (config) => {
let processing = false;

const runOnce = async () => {
if (processing) {
logger.warn("Renewal tick skipped: previous run still in progress");
return;
}

processing = true;
try {
await executeRenew(config);
} catch (err) {
logger.error(`Daemon renew run failed: ${err.message}`);
} finally {
processing = false;
}
};

logger.info(`Daemon started, check interval=${config.checkIntervalMinutes} minute(s)`);
await runOnce();
setInterval(runOnce, config.checkIntervalMinutes * 60 * 1000);
};

const main = async () => {
const [, , command, ...rest] = process.argv;
if (!["validate", "issue", "renew", "daemon"].includes(command)) {
usage();
process.exit(1);
}

	try {
		const options = parseArgs(rest);
		const config = readPomConfig(options.config);

		if (command === "validate") {
await validateRuntime(config);
logger.success(`Configuration is valid: ${config.configPath}`);
return;
}

if (command === "issue") {
await executeIssue(config);
return;
}

if (command === "renew") {
await executeRenew(config);
return;
}

await executeDaemon(config);
} catch (err) {
logger.error(err.message);
process.exit(1);
}
};

await main();
