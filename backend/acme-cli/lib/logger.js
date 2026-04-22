const log = (level, ...args) => {
const timestamp = new Date().toISOString();
console.log(`[${timestamp}] [${level}]`, ...args);
};

const logger = {
info: (...args) => log("INFO", ...args),
warn: (...args) => log("WARN", ...args),
error: (...args) => log("ERROR", ...args),
success: (...args) => log("SUCCESS", ...args),
};

export default logger;
