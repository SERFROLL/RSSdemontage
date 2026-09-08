import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createPool, createDatabase } from "./postgres.mjs";

export function createBucket(config) {
  let client;
  function storage() {
    for (const name of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
      if (!config[name]) throw new Error("Audio storage is not configured");
    }
    client ??= new S3Client({
      endpoint: config.S3_ENDPOINT, region: config.S3_REGION,
      forcePathStyle: true, maxAttempts: 2,
      requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
    });
    return client;
  }
  return {
    async put(key, stream, options = {}) {
      const body = new Uint8Array(await new Response(stream).arrayBuffer());
      if (body.byteLength > 10 * 1024 * 1024) throw new Error("Audio is too large");
      await storage().send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: body,
        ContentType: options.httpMetadata?.contentType || "application/octet-stream" }));
    },
    async get(key) {
      try {
        const object = await storage().send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
        return object.Body ? { body: object.Body.transformToWebStream() } : null;
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },
    close() { client?.destroy(); },
  };
}

const key = Symbol.for("pid-cable.node-runtime");
export function nodeRuntime() {
  if (!globalThis[key]) {
    if (process.env.APP_MODE !== "production") throw new Error("Timeweb requires APP_MODE=production; demo headers are not trusted here");
    const pool = createPool();
    globalThis[key] = { ...process.env, pool, DB: createDatabase(pool), BUCKET: createBucket(process.env) };
  }
  return globalThis[key];
}
export const env = new Proxy({}, { get: (_target, property) => nodeRuntime()[property] });
