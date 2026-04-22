import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const getLiveCertPath = (certName) => {
return `/etc/letsencrypt/live/${certName}`;
};

const certExists = async (certPath) => {
try {
await fs.promises.access(certPath, fs.constants.R_OK);
return true;
} catch (_err) {
return false;
}
};

const getCertificateExpiry = async (certFile) => {
const { stdout } = await execFileAsync("openssl", ["x509", "-in", certFile, "-enddate", "-noout"]);
const line = stdout.trim();
const raw = line.split("=")[1];
if (!raw) {
throw new Error(`Could not parse expiry from certificate file: ${certFile}`);
}
const parsed = new Date(raw.trim());
if (Number.isNaN(parsed.getTime())) {
throw new Error(`Could not parse certificate expiry date '${raw.trim()}'`);
}
return parsed;
};

const shouldRenewByExpiry = async (certFile, renewBeforeDays) => {
if (!(await certExists(certFile))) {
return { shouldRenew: true, expiresAt: null, remainingDays: null, reason: "certificate file missing" };
}

const expiresAt = await getCertificateExpiry(certFile);
const remainingDays = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
const shouldRenew = remainingDays <= renewBeforeDays;
const reason = shouldRenew
? `certificate expires in ${remainingDays.toFixed(2)} days`
: `certificate valid for ${remainingDays.toFixed(2)} more days`;

return { shouldRenew, expiresAt, remainingDays, reason };
};

const atomicWrite = async (targetPath, data, mode = 0o644) => {
const dir = path.dirname(targetPath);
const tmpPath = path.join(dir, `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
await fs.promises.writeFile(tmpPath, data, { mode });
await fs.promises.rename(tmpPath, targetPath);
};

const deployCertificate = async (config) => {
const sourceDir = getLiveCertPath(config.certName);
const srcFullchain = path.join(sourceDir, "fullchain.pem");
const srcPrivkey = path.join(sourceDir, "privkey.pem");

if (!(await certExists(srcFullchain)) || !(await certExists(srcPrivkey))) {
throw new Error(
`Certbot output not found for cert '${config.certName}' under ${sourceDir}. Issue certificate first.`,
);
}

await fs.promises.mkdir(config.outputDir, { recursive: true });
const certBody = await fs.promises.readFile(srcFullchain);
const keyBody = await fs.promises.readFile(srcPrivkey);

const certFile = path.join(config.outputDir, `${config.certAlias}.crt`);
const keyFile = path.join(config.outputDir, `${config.certAlias}.key`);

await atomicWrite(certFile, certBody, 0o644);
await atomicWrite(keyFile, keyBody, 0o600);

if (config.archiveEnabled) {
await fs.promises.mkdir(config.archiveDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").replace(".", "_");
const archiveCert = path.join(config.archiveDir, `${config.certAlias}-${stamp}.crt`);
const archiveKey = path.join(config.archiveDir, `${config.certAlias}-${stamp}.key`);
await fs.promises.writeFile(archiveCert, certBody, { mode: 0o644 });
await fs.promises.writeFile(archiveKey, keyBody, { mode: 0o600 });
}

const expiresAt = await getCertificateExpiry(certFile);
return { certFile, keyFile, expiresAt, sourceDir };
};

export { getLiveCertPath, shouldRenewByExpiry, deployCertificate, getCertificateExpiry };
