import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], {
  stdio: "inherit", env: { ...process.env, DEPLOY_TARGET: "timeweb" },
});
process.exit(result.status ?? 1);
