import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import dnsPlugins from "../../certbot/dns-plugins.json" with { type: "json" };

const DEFAULTS = {
challenge: "http",
renewBeforeDays: 30,
checkIntervalMinutes: 60,
retryCount: 2,
retryDelaySeconds: 10,
certbotCommand: "certbot",
letsencryptConfig: "/etc/letsencrypt.ini",
certbotWorkDir: "/tmp/letsencrypt-lib",
certbotLogsDir: "/var/log/letsencrypt",
archiveEnabled: false,
};

const parser = new XMLParser({
ignoreAttributes: false,
trimValues: true,
parseTagValue: true,
});

const getTextList = (value) => {
if (Array.isArray(value)) {
return value.map((item) => `${item}`.trim()).filter(Boolean);
}
if (typeof value === "string") {
return value
.split(",")
.map((item) => item.trim())
.filter(Boolean);
}
if (typeof value === "number" || typeof value === "boolean") {
return [`${value}`.trim()].filter(Boolean);
}
return [];
};

const toBool = (value, defaultValue = false) => {
if (typeof value === "boolean") {
return value;
}
if (typeof value === "string") {
return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
return defaultValue;
};

const toInt = (value, defaultValue) => {
const parsed = Number.parseInt(`${value}`, 10);
if (Number.isNaN(parsed)) {
return defaultValue;
}
return parsed;
};

const resolveFilePath = (filePath) => {
	if (typeof filePath !== "string" || !filePath.trim()) {
		throw new Error("Expected a non-empty path value in pom.xml");
	}

	if (path.isAbsolute(filePath)) {
		return filePath;
	}
	return path.resolve(process.cwd(), filePath);
};

const readPomConfig = (configPath) => {
const absPath = resolveFilePath(configPath);
if (!fs.existsSync(absPath)) {
throw new Error(`Config file does not exist: ${absPath}`);
}

const raw = fs.readFileSync(absPath, "utf8");
const parsed = parser.parse(raw);
const acme = parsed?.project?.acme;

if (!acme || typeof acme !== "object") {
throw new Error("Invalid pom.xml: missing <project><acme> section");
}

const domainValues = getTextList(acme?.domains?.domain);
const extraArgs = getTextList(acme?.extraArgs?.arg);
const outputDir = resolveFilePath(acme.outputDir);
const archiveDir = resolveFilePath(acme.archiveDir || path.join(outputDir, "archive"));
const stateFile = resolveFilePath(acme.stateFile || path.join(outputDir, ".acme-state.json"));
const certAlias = `${acme.certAlias || ""}`.trim();
const certName = `${acme.certName || certAlias}`.trim();

const config = {
configPath: absPath,
email: `${acme.email || ""}`.trim(),
domains: domainValues,
challenge: `${acme.challenge || DEFAULTS.challenge}`.trim().toLowerCase(),
webroot: `${acme.webroot || ""}`.trim(),
outputDir,
certAlias,
certName,
staging: toBool(acme.staging, false),
renewBeforeDays: toInt(acme.renewBeforeDays, DEFAULTS.renewBeforeDays),
checkIntervalMinutes: toInt(acme.checkIntervalMinutes, DEFAULTS.checkIntervalMinutes),
retryCount: toInt(acme.retryCount, DEFAULTS.retryCount),
retryDelaySeconds: toInt(acme.retryDelaySeconds, DEFAULTS.retryDelaySeconds),
archiveEnabled: toBool(acme.archiveEnabled, DEFAULTS.archiveEnabled),
archiveDir,
stateFile,
certbotCommand: `${acme.certbotCommand || DEFAULTS.certbotCommand}`.trim(),
letsencryptConfig: `${acme.letsencryptConfig || DEFAULTS.letsencryptConfig}`.trim(),
certbotWorkDir: `${acme.certbotWorkDir || DEFAULTS.certbotWorkDir}`.trim(),
certbotLogsDir: `${acme.certbotLogsDir || DEFAULTS.certbotLogsDir}`.trim(),
extraArgs,
dns: {
provider: `${acme?.dns?.provider || ""}`.trim(),
credentials: `${acme?.dns?.credentials || ""}`,
propagationSeconds: toInt(acme?.dns?.propagationSeconds, 0),
},
};

validateConfig(config);
return config;
};

const validateConfig = (config) => {
const errors = [];

if (!config.email || !config.email.includes("@")) {
errors.push("acme.email must be a valid email address");
}

if (!config.domains.length) {
errors.push("acme.domains.domain must include at least one domain");
}

if (!config.certAlias) {
errors.push("acme.certAlias is required");
}

if (!config.certName) {
errors.push("acme.certName (or acme.certAlias) is required");
}

if (!["http", "dns"].includes(config.challenge)) {
errors.push("acme.challenge must be either 'http' or 'dns'");
}

if (config.challenge === "http" && !config.webroot) {
errors.push("acme.webroot is required when challenge is http");
}

if (config.challenge === "dns") {
if (!config.dns.provider) {
errors.push("acme.dns.provider is required when challenge is dns");
} else if (typeof dnsPlugins[config.dns.provider] === "undefined") {
errors.push(`acme.dns.provider '${config.dns.provider}' is not supported`);
}

if (!config.dns.credentials) {
errors.push("acme.dns.credentials is required when challenge is dns");
}
}

if (config.renewBeforeDays < 0) {
errors.push("acme.renewBeforeDays must be >= 0");
}

if (config.checkIntervalMinutes <= 0) {
errors.push("acme.checkIntervalMinutes must be > 0");
}

if (config.retryCount < 0) {
errors.push("acme.retryCount must be >= 0");
}

if (config.retryDelaySeconds < 0) {
errors.push("acme.retryDelaySeconds must be >= 0");
}

if (!path.isAbsolute(config.outputDir)) {
errors.push("acme.outputDir must resolve to an absolute path");
}

if (!path.isAbsolute(config.stateFile)) {
errors.push("acme.stateFile must resolve to an absolute path");
}

if (errors.length) {
throw new Error(`Invalid pom.xml configuration:\n- ${errors.join("\n- ")}`);
}
};

const getDnsPlugin = (provider) => {
	return dnsPlugins[provider] || null;
};

export { readPomConfig, validateConfig, getDnsPlugin };
