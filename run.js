const { spawn, execSync } = require("child_process");
const fs = require("fs");

if (!fs.existsSync("node_modules")) {
  console.log("[+] Installing packages...");
  try {
    execSync("npm install", { stdio: "inherit" });
    console.log("[+] Packages installed successfully.");
  } catch (error) {
    console.error("[!] Failed to install packages.");
    console.error(error);
    process.exit(1);
  }
} else {
  console.log("[+] Packages already installed.");
}

console.log("[+] Starting OZONE Bot...");
const child = spawn("node", ["ozone.js"], { stdio: "inherit" });

child.on("error", (error) => {
  console.error("[!] Failed to start bot:", error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  console.log(`[+] Bot process exited with code ${code ?? 0}${signal ? ` (signal: ${signal})` : ""}`);
  process.exit(code ?? 0);
});