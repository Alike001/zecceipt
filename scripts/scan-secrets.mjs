import { opendir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const excludedDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "node_modules",
]);
const excludedFiles = new Set(["package-lock.json"]);
const maximumFileSize = 1_000_000;

const signatures = [
  {
    name: "GitHub token",
    pattern: /\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  {
    name: "populated QuickNode variable",
    pattern: /QUICKNODE_ZCASH_RPC_URL\s*=\s*[^\s#]+/,
  },
  {
    name: "QuickNode credential URL",
    pattern: /https?:\/\/[^\s"']*\.quiknode\.pro\/[^\s"']+/i,
  },
  {
    name: "populated database credential",
    pattern:
      /(?:DATABASE_URL|INVOICE_MANAGEMENT_SECRET|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*[^\s#]+/,
  },
  {
    name: "private key block",
    pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/,
  },
];

async function* walk(directory) {
  const entries = await opendir(directory);

  for await (const entry of entries) {
    if (excludedDirectories.has(entry.name)) continue;

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      yield* walk(entryPath);
    } else if (entry.isFile() && !excludedFiles.has(entry.name)) {
      yield entryPath;
    }
  }
}

const findings = [];

for await (const filePath of walk(process.cwd())) {
  const contents = await readFile(filePath);
  if (contents.byteLength > maximumFileSize || contents.includes(0)) continue;

  const text = contents.toString("utf8");
  for (const signature of signatures) {
    if (signature.pattern.test(text)) {
      findings.push(
        `${path.relative(process.cwd(), filePath)}: ${signature.name}`,
      );
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected:\n" + findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Secret check passed.");
}
