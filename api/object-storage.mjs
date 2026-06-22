import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function defaultStorageRoot() {
  return process.env.LAYERPILOT_STORAGE_DIR || path.join(process.cwd(), "api", "storage");
}

export function isPathInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function cleanKey(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\./g, "").replace(/\/+/g, "/");
}

function contentTypeFor(filename = "", type = "") {
  const lower = filename.toLowerCase();
  if (type === "GCODE" || lower.endsWith(".gcode")) return "text/x-gcode";
  if (lower.endsWith(".stl")) return "model/stl";
  if (lower.endsWith(".3mf")) return "model/3mf";
  return "application/octet-stream";
}

async function streamToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function createObjectStorage(options = {}) {
  const provider = String(options.provider || process.env.LAYERPILOT_OBJECT_STORAGE_PROVIDER || "local").toLowerCase();
  if (provider === "s3") {
    const bucket = options.bucket || process.env.LAYERPILOT_S3_BUCKET;
    if (!bucket) throw new Error("LAYERPILOT_S3_BUCKET is required when object storage provider is s3");
    const prefix = cleanKey(options.prefix || process.env.LAYERPILOT_S3_PREFIX || "layerpilot");
    const client = options.client || new S3Client({
      region: process.env.LAYERPILOT_S3_REGION || "us-east-1",
      endpoint: process.env.LAYERPILOT_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.LAYERPILOT_S3_FORCE_PATH_STYLE === "true",
      credentials: process.env.LAYERPILOT_S3_ACCESS_KEY_ID ? {
        accessKeyId: process.env.LAYERPILOT_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.LAYERPILOT_S3_SECRET_ACCESS_KEY || ""
      } : undefined
    });
    const keyFor = (relativePath) => cleanKey([prefix, cleanKey(relativePath)].filter(Boolean).join("/"));
    return {
      provider: "s3",
      root: `s3://${bucket}/${prefix}`,
      async put({ relativePath, buffer, filename, type }) {
        const key = keyFor(relativePath);
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentTypeFor(filename, type) }));
        return { storagePath: `s3://${bucket}/${key}`, storageProvider: "s3", storageKey: key, bytes: buffer.length };
      },
      async get(file) {
        const key = file.storageKey || cleanKey(String(file.storagePath || "").replace(/^s3:\/\/[^/]+\//, ""));
        const output = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return streamToBuffer(output.Body);
      },
      async stat(file) {
        const key = file.storageKey || cleanKey(String(file.storagePath || "").replace(/^s3:\/\/[^/]+\//, ""));
        const output = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return Number(output.ContentLength || 0);
      },
      async delete(file) {
        const key = file.storageKey || cleanKey(String(file.storagePath || "").replace(/^s3:\/\/[^/]+\//, ""));
        if (!key) return false;
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      },
      async health() {
        const key = keyFor(`health/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "ok", ContentType: "text/plain" }));
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return { ok: true, detail: `s3://${bucket}/${prefix}` };
      }
    };
  }

  const root = options.root || defaultStorageRoot();
  return {
    provider: "local",
    root,
    async put({ relativePath, buffer }) {
      const storagePath = path.join(root, cleanKey(relativePath));
      await mkdir(path.dirname(storagePath), { recursive: true });
      await writeFile(storagePath, buffer);
      return { storagePath, storageProvider: "local", bytes: buffer.length };
    },
    async get(file) {
      if (!file.storagePath || !isPathInside(root, file.storagePath)) throw new Error("Stored file is outside local storage root");
      return readFile(file.storagePath);
    },
    async stat(file) {
      if (!file.storagePath || !isPathInside(root, file.storagePath)) throw new Error("Stored file is outside local storage root");
      const info = await stat(file.storagePath);
      return info.size;
    },
    async delete(file) {
      if (!file.storagePath || !isPathInside(root, file.storagePath)) return false;
      const parent = path.dirname(file.storagePath);
      await rm(file.storagePath, { force: true }).catch(() => undefined);
      if (isPathInside(root, parent) && /[\\\/](uploads|slices|restored)[\\\/][^\\\/]+$/.test(parent)) {
        await rm(parent, { recursive: true, force: true }).catch(() => undefined);
      }
      return true;
    },
    async health() {
      await mkdir(root, { recursive: true });
      const probePath = path.join(root, ".layerpilot-storage-check");
      await writeFile(probePath, new Date().toISOString());
      await rm(probePath, { force: true }).catch(() => undefined);
      return { ok: true, detail: root };
    }
  };
}
