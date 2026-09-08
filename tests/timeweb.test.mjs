import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { postgresSql } from "../server/postgres.mjs";
import { createBucket, nodeRuntime } from "../server/runtime.mjs";

test("SQL translation leaves quoted question marks unchanged", () => {
  assert.equal(postgresSql("SELECT '?' AS value, 'it''s?' WHERE key=? AND pid=?"), "SELECT '?' AS value, 'it''s?' WHERE key=$1 AND pid=$2");
  assert.equal(postgresSql("INSERT OR IGNORE INTO notifications(key) VALUES (?) RETURNING key"), "INSERT INTO notifications(key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key");
});

test("Node runtime refuses the Sites demo header mode", () => {
  const previous = process.env.APP_MODE;
  process.env.APP_MODE = "demo";
  try { assert.throws(nodeRuntime, /APP_MODE=production/); }
  finally { if (previous === undefined) delete process.env.APP_MODE; else process.env.APP_MODE = previous; }
});

test("S3 adapter stores and returns private audio, handles missing objects", async () => {
  const objects = new Map();
  const server = createServer(async (req, res) => {
    assert.match(req.headers.authorization || "", /^AWS4-HMAC-SHA256 /);
    assert.equal(req.headers["x-amz-acl"], undefined);
    const key = new URL(req.url, "http://localhost").pathname;
    if (req.method === "PUT") {
      assert.equal(req.headers["content-type"], "audio/ogg");
      const chunks=[]; for await (const chunk of req) chunks.push(chunk);
      objects.set(key,Buffer.concat(chunks));res.writeHead(200,{etag:'"test"'}).end();
    } else if (objects.has(key)) res.writeHead(200).end(objects.get(key));
    else res.writeHead(404,{"Content-Type":"application/xml"}).end("<Error><Code>NoSuchKey</Code></Error>");
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const bucket = createBucket({ S3_ENDPOINT:`http://127.0.0.1:${server.address().port}`, S3_REGION:"test", S3_BUCKET:"private-audio",
    S3_ACCESS_KEY_ID:"test-only-key",S3_SECRET_ACCESS_KEY:"test-only-secret" });
  try {
    await bucket.put("production/audio/example",new Blob(["audio bytes"]).stream(),{httpMetadata:{contentType:"audio/ogg"}});
    const object=await bucket.get("production/audio/example");
    assert.equal(await new Response(object.body).text(),"audio bytes");
    assert.ok(objects.has("/private-audio/production/audio/example"));
    assert.equal(await bucket.get("production/audio/missing"),null);
  } finally { bucket.close(); await new Promise(resolve=>server.close(resolve)); }
});
