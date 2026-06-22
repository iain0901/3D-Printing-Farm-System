#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(process.env.LAYERPILOT_DIR || resolve(scriptDir, ".."));
const packageDir = resolve(process.env.LAYERPILOT_PACKAGE_DIR || resolve(rootDir, "release"));

const requiredFiles = [
  "package.json",
  "package-lock.json",
  "LICENSE.md",
  "LICENSE.zh-TW.md",
  "LICENSE.zh-CN.md",
  "Dockerfile",
  "docker-compose.yml",
  "README.zh-TW.md",
  "README.zh-CN.md",
  "src/App.tsx",
  "api/server.mjs",
  "api/worker.mjs",
  "scripts/ubuntu-deploy.sh",
  "scripts/ubuntu-backup.sh",
  "scripts/ubuntu-setup.sh",
  "scripts/ubuntu-go-live-check.sh",
  "scripts/ubuntu-package.sh",
  "scripts/package-ubuntu.mjs",
  "scripts/ubuntu-support-bundle.sh",
  "deploy/ubuntu/nginx.layerpilot.conf",
  ".env.example"
];

const excludedPatterns = [
  "api/*.test.mjs",
  "api/data",
  "api/storage",
  "node_modules",
  "dist",
  "release",
  "work",
  "coverage",
  ".git",
  ".env",
  "*.tgz",
  "*.tar",
  "*.tar.gz"
];

const allowedEntries = [
  ".dockerignore",
  ".env.example",
  ".gitignore",
  "Dockerfile",
  "docker-compose.yml",
  "index.html",
  "LICENSE.md",
  "LICENSE.zh-TW.md",
  "LICENSE.zh-CN.md",
  "package-lock.json",
  "package.json",
  "README.md",
  "README.zh-TW.md",
  "README.zh-CN.md",
  "tsconfig.json",
  "vite.config.ts",
  "api",
  "deploy",
  "public",
  "scripts",
  "src"
];

const forbiddenMemberPattern = /(^|\/)(node_modules|dist|release|work|coverage|\.git|api\/data|api\/storage)(\/|$)|(^|\/)\.env$|\.tgz$|\.tar$|\.tar\.gz$|layerpilot-(support|data|pre-restore)-/;

function usage() {
  console.log(`Usage:
  node scripts/package-ubuntu.mjs package
  node scripts/package-ubuntu.mjs verify /path/to/layerpilot-ubuntu-YYYYmmdd-HHMMSS.tgz

Environment:
  LAYERPILOT_DIR          Project root, default parent of this script
  LAYERPILOT_PACKAGE_DIR  Output directory for release bundles, default ./release

This command creates and verifies a source deployment bundle for copying to an
Ubuntu server. It requires a system tar command and works from Windows, macOS,
and Linux as long as tar is available.`);
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
}

function normalizeMember(member) {
  return member.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function runTar(args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("tar", args, {
      cwd: rootDir,
      windowsHide: true,
      ...options
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`Unable to run tar. Install tar or use Ubuntu to package the release. ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      reject(new Error(stderr.trim() || `tar exited with code ${code}`));
    });
  });
}

async function archiveMembers(archive) {
  const output = await runTar(["-tzf", archive]);
  return output
    .split(/\r?\n/)
    .map((member) => normalizeMember(member.trim()))
    .filter(Boolean);
}

async function verifyArchive(archive) {
  if (!archive) {
    throw new Error("verify requires an existing .tgz archive path.");
  }
  const archivePath = resolve(archive);
  const members = await archiveMembers(archivePath);
  const memberSet = new Set(members);
  const missing = requiredFiles.filter((required) => !memberSet.has(required));
  if (missing.length) {
    throw new Error(`Release bundle is missing required file: ${missing.join(", ")}`);
  }
  const forbidden = members.find((member) => forbiddenMemberPattern.test(member));
  if (forbidden) {
    throw new Error(`Release bundle contains forbidden local data, secret, backup, or build artifact path: ${forbidden}`);
  }
  await verifyChecksumIfPresent(archivePath);
  console.log(`Release bundle verified: ${archivePath}`);
}

async function fileSha256(file) {
  const buffer = await readFile(file);
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeChecksum(archive) {
  const hash = await fileSha256(archive);
  const checksumPath = `${archive}.sha256`;
  await writeFile(checksumPath, `${hash}  ${basename(archive)}\n`, "utf8");
  console.log(`Release checksum written: ${checksumPath}`);
  return checksumPath;
}

async function verifyChecksumIfPresent(archive) {
  const checksumPath = `${archive}.sha256`;
  let checksum;
  try {
    checksum = await readFile(checksumPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const expected = checksum.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(expected)) {
    throw new Error(`Release checksum file is invalid: ${checksumPath}`);
  }
  const actual = await fileSha256(archive);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Release checksum mismatch for ${archive}`);
  }
  console.log(`Release checksum verified: ${checksumPath}`);
}

async function createPackage() {
  await mkdir(packageDir, { recursive: true });
  const target = resolve(packageDir, `layerpilot-ubuntu-${timestamp()}.tgz`);
  const tarArgs = [
    "-czf",
    target,
    ...excludedPatterns.map((pattern) => `--exclude=${pattern}`),
    ...allowedEntries
  ];
  await runTar(tarArgs);
  await writeChecksum(target);
  await verifyArchive(target);
  console.log(`Ubuntu release bundle written: ${target}`);
}

async function main() {
  const [command = "package", archive] = process.argv.slice(2);
  if (command === "package") {
    await createPackage();
    return;
  }
  if (command === "verify") {
    await verifyArchive(archive);
    return;
  }
  if (["-h", "--help", "help"].includes(command)) {
    usage();
    return;
  }
  usage();
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
