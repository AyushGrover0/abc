const path = require("path");
const { spawn } = require("child_process");

const electronPath = path.join(__dirname, "..", "..", "node_modules", "electron", "dist", "electron.exe");
const appPath = path.join(__dirname, "..", "..");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [appPath], {
  cwd: appPath,
  stdio: "inherit",
  env
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
