import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const skipDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".vite",
  "playwright-report",
  "test-results",
]);
const mojibakeMarkers = ["â€”", "â€“", "â€", "â†", "Ã—", "â‰", "âœ", "Â"];

async function collectMarkdownFiles(rootDir) {
  const files = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    const relativePath = path.relative(repoRoot, entryPath).split(path.sep).join("/");

    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name) || relativePath === "docs/archive") {
        continue;
      }
      files.push(...(await collectMarkdownFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function isExternalLink(target) {
  return /^(https?:|mailto:|tel:)/i.test(target);
}

function normalizeLocalLink(rawTarget) {
  const [targetWithoutHash] = rawTarget.split("#");
  const [targetWithoutQuery] = targetWithoutHash.split("?");
  return targetWithoutQuery.trim();
}

function findMarkdownLinks(content) {
  const matches = [];
  const linkPattern = /!?\[[^\]]*]\(([^)\s]+(?:\s+"[^"]*")?)\)/g;
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const rawTarget = match[1].trim().replace(/\s+"[^"]*"$/, "");
    matches.push(rawTarget);
  }
  return matches;
}

async function main() {
  const files = await collectMarkdownFiles(repoRoot);
  const failures = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const relativeFile = path.relative(repoRoot, filePath).split(path.sep).join("/");

    for (const marker of mojibakeMarkers) {
      if (content.includes(marker)) {
        failures.push(`${relativeFile}: contains mojibake marker "${marker}"`);
      }
    }

    for (const rawTarget of findMarkdownLinks(content)) {
      if (!rawTarget || rawTarget.startsWith("#") || isExternalLink(rawTarget)) {
        continue;
      }

      const normalized = normalizeLocalLink(rawTarget);
      if (!normalized) {
        continue;
      }

      const resolved = path.resolve(path.dirname(filePath), normalized);
      try {
        await fs.access(resolved);
      } catch {
        failures.push(`${relativeFile}: broken local link -> ${rawTarget}`);
      }
    }
  }

  await verifyDocumentedFrontendRoutes(failures);
  await verifyDocumentedRelayRoutes(failures);

  if (failures.length > 0) {
    console.error("Documentation integrity check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Documentation integrity check passed for ${files.length} markdown files.`);
}

async function verifyDocumentedFrontendRoutes(failures) {
  const appPath = path.join(repoRoot, "frontend", "src", "App.tsx");
  const readmePath = path.join(repoRoot, "frontend", "README.md");
  const [appSource, readmeSource] = await Promise.all([
    fs.readFile(appPath, "utf8"),
    fs.readFile(readmePath, "utf8"),
  ]);

  const routeMatches = [...appSource.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]);
  const documentedRoutes = new Set([...readmeSource.matchAll(/`(\/[^`]*)`/g)].map((match) => match[1]));

  for (const route of routeMatches) {
    if (route === "*") {
      continue;
    }
    if (!documentedRoutes.has(route)) {
      failures.push(`frontend/README.md: missing documented route -> ${route}`);
    }
  }
}

async function verifyDocumentedRelayRoutes(failures) {
  const serverPath = path.join(repoRoot, "gas-relay", "src", "server.ts");
  const readmePath = path.join(repoRoot, "gas-relay", "README.md");
  const [serverSource, readmeSource] = await Promise.all([
    fs.readFile(serverPath, "utf8"),
    fs.readFile(readmePath, "utf8"),
  ]);

  const routeMatches = [...serverSource.matchAll(/app\.(get|post)\("([^"]+)"/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  const documentedRoutes = new Set(
    [...readmeSource.matchAll(/- `(GET|POST) ([^`]+)`/g)].map((match) => `${match[1]} ${match[2]}`),
  );

  for (const route of routeMatches) {
    if (!documentedRoutes.has(route)) {
      failures.push(`gas-relay/README.md: missing documented route -> ${route}`);
    }
  }
}

await main();
