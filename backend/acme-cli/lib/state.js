import fs from "node:fs";
import path from "node:path";

const ensureParentDir = async (filePath) => {
await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
};

const readState = async (stateFile) => {
try {
const content = await fs.promises.readFile(stateFile, "utf8");
return JSON.parse(content);
} catch (_err) {
return {};
}
};

const writeState = async (stateFile, data) => {
await ensureParentDir(stateFile);
const content = JSON.stringify(data, null, 2);
await fs.promises.writeFile(stateFile, `${content}\n`, "utf8");
};

export { readState, writeState };
