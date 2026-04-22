import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { installPlugin } from "../../lib/certbot.js";
import { getDnsPlugin } from "./config.js";
import logger from "./logger.js";

const execFileAsync = promisify(execFile);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runCertbot = async (config, args, options = {}) => {
let attempt = 0;
let lastError;
while (attempt <= config.retryCount) {
try {
logger.info(`Executing: ${config.certbotCommand} ${args.join(" ")}`);
const { stdout, stderr } = await execFileAsync(config.certbotCommand, args, options);
if (stdout?.trim()) {
logger.info(stdout.trim());
}
if (stderr?.trim()) {
logger.warn(stderr.trim());
}
return;
} catch (err) {
lastError = err;
attempt += 1;
if (attempt > config.retryCount) {
break;
}
logger.warn(
`Certbot command failed. Retry ${attempt}/${config.retryCount} in ${config.retryDelaySeconds}s: ${err.message}`,
);
await sleep(config.retryDelaySeconds * 1000);
}
}

throw lastError;
};

const baseArgs = (config) => {
const args = [
"--non-interactive",
"--config",
config.letsencryptConfig,
"--work-dir",
config.certbotWorkDir,
"--logs-dir",
config.certbotLogsDir,
"--cert-name",
config.certName,
];

if (config.staging) {
args.push("--staging");
}

if (config.extraArgs.length) {
args.push(...config.extraArgs);
}

return args;
};

const writeDnsCredentials = async (config) => {
	const fileName = `credentials-${config.certName.replace(/[^A-Za-z0-9_-]/g, "-")}`;
const credentialsDir = "/etc/letsencrypt/credentials";
await fs.promises.mkdir(credentialsDir, { recursive: true });
const credentialsPath = path.join(credentialsDir, fileName);
await fs.promises.writeFile(credentialsPath, config.dns.credentials, { mode: 0o600 });
return credentialsPath;
};

const addChallengeArgs = async (config, args) => {
if (config.challenge === "http") {
args.push("--authenticator", "webroot", "--webroot-path", config.webroot, "--preferred-challenges", "http");
return { options: {} };
}

const dnsPlugin = getDnsPlugin(config.dns.provider);
if (!dnsPlugin) {
throw new Error(`Unknown DNS provider '${config.dns.provider}'`);
}

await installPlugin(config.dns.provider);
const credentialsPath = await writeDnsCredentials(config);
const hasConfigArg = config.dns.provider !== "route53";

args.push("--preferred-challenges", "dns", "--authenticator", dnsPlugin.full_plugin_name);
if (hasConfigArg) {
args.push(`--${dnsPlugin.full_plugin_name}-credentials`, credentialsPath);
}

if (config.dns.propagationSeconds > 0) {
args.push(`--${dnsPlugin.full_plugin_name}-propagation-seconds`, `${config.dns.propagationSeconds}`);
}

	const options = {};
	if (config.dns.provider === "route53") {
		// certbot-dns-route53 reads AWS credentials from AWS_CONFIG_FILE
		// instead of accepting a --dns-route53-credentials file argument.
		options.env = {
			...process.env,
			AWS_CONFIG_FILE: credentialsPath,
};
}

return { options };
};

const issueCertificate = async (config) => {
const args = [
"certonly",
"--agree-tos",
"-m",
config.email,
"--domains",
config.domains.join(","),
...baseArgs(config),
];

const { options } = await addChallengeArgs(config, args);
await runCertbot(config, args, options);
};

const renewCertificate = async (config) => {
const args = [
"renew",
"--force-renewal",
"--disable-hook-validation",
"--no-random-sleep-on-renew",
...baseArgs(config),
];

const { options } = await addChallengeArgs(config, args);
await runCertbot(config, args, options);
};

const validateRuntime = async (config) => {
await fs.promises.mkdir(config.outputDir, { recursive: true });
if (config.archiveEnabled) {
await fs.promises.mkdir(config.archiveDir, { recursive: true });
}

if (config.challenge === "http") {
await fs.promises.mkdir(config.webroot, { recursive: true });
}

await runCertbot(config, ["--version"]);
};

export { issueCertificate, renewCertificate, validateRuntime };
