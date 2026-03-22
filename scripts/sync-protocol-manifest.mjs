import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, "..");
const sourcePath = path.join(repoRoot, "deployments", "testnet.json");
const targetPath = path.join(repoRoot, "frontend", "public", "protocol-manifest.json");
const checkOnly = process.argv.includes("--check");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!fs.existsSync(sourcePath)) {
  fail(`Canonical manifest not found: ${sourcePath}`);
} else {
  const sourceContent = fs.readFileSync(sourcePath, "utf8");
  const targetExists = fs.existsSync(targetPath);
  const targetContent = targetExists ? fs.readFileSync(targetPath, "utf8") : null;

  if (checkOnly) {
    if (!targetExists) {
      fail(`Served frontend manifest is missing: ${targetPath}`);
    } else if (targetContent !== sourceContent) {
      fail(`Served frontend manifest is out of sync with ${sourcePath}`);
    } else {
      console.log(`Verified protocol manifest parity at ${targetPath}`);
    }
  } else {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, sourceContent, "utf8");
    console.log(`Synced protocol manifest to ${targetPath}`);
  }
}
