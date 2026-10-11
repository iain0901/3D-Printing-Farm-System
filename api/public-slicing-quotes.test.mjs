import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer, openDatabase } from "./server.mjs";

const cleanups = [];
afterEach(async () => {
  delete process.env.LAYERPILOT_WORKER_TOKEN;
  while (cleanups.length) await rm(cleanups.pop(), { recursive: true, force: true });
});

const cubeStl = `solid cube
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 20 0 0
vertex 0 20 0
endloop
endfacet
endsolid cube`;

function multipart({ boundary, files = [], payload, fields = {} }) {
  const chunks = [];
  const field = (name, value) => {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  };
  if (payload !== undefined) field("payload", JSON.stringify(payload));
  for (const [name, value] of Object.entries(fields)) field(name, value);
  for (const file of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    chunks.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

async function createApp() {
  const directory = await mkdtemp(path.join(tmpdir(), "farmflow-public-slice-"));
  cleanups.push(directory);
  const dbFile = path.join(directory, "state.json");
  const db = await openDatabase(dbFile);
  const app = await buildServer({ db, serveStatic: false });
  return { app, db, dbFile };
}

const postQuote = (app, payload = {}, files = [{ name: "cube.stl", content: cubeStl }]) => {
  const boundary = `quote-${Math.random().toString(16).slice(2)}`;
  return app.inject({
    method: "POST",
    url: "/api/public/slicing-quotes",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: multipart({ boundary, files, payload: { material: "PETG", quantity: 2, layerHeight: 0.2, infill: 18, walls: 3, autoSupports: true, ...payload } })
  });
};

const workerHeaders = () => ({ "x-layerpilot-worker-token": "test-worker-token" });

describe("public real Orca slicing quote jobs", () => {
  it("persists a token-scoped queued job and never presents it as a completed quote", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app, db, dbFile } = await createApp();
    const created = await postQuote(app);
    expect(created.statusCode).toBe(202);
    const body = created.json();
    expect(body).toMatchObject({ ok: true, slicingQuote: { status: "queued", material: "PETG", quantity: 2, engine: "OrcaSlicer", autoOrient: true, autoArrange: true, autoSupports: true } });
    expect(body.accessToken.length).toBeGreaterThanOrEqual(32);
    expect(body.slicingQuote).not.toHaveProperty("quote");
    expect(body.slicingQuote).not.toHaveProperty("price");
    expect(db.data.slicingQuotes).toHaveLength(1);
    expect(db.data.slicingQuotes[0]).not.toHaveProperty("accessToken");
    expect(db.data.slicingQuotes[0].publicAccessTokenHash).not.toContain(body.accessToken);

    const denied = await app.inject({ method: "GET", url: `/api/public/slicing-quotes/${body.slicingQuote.id}?token=wrong-token-value-that-is-long-enough` });
    expect(denied.statusCode).toBe(404);
    const fetched = await app.inject({ method: "GET", url: `/api/public/slicing-quotes/${body.slicingQuote.id}?token=${encodeURIComponent(body.accessToken)}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().slicingQuote.status).toBe("queued");
    await app.close();
    const reopened = await openDatabase(dbFile);
    expect(reopened.data.slicingQuotes).toEqual(expect.arrayContaining([expect.objectContaining({ id: body.slicingQuote.id, status: "queued" })]));
    await reopened.close?.();
  });

  it("uses the protected existing worker queue and derives the final price only from worker measurements", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app, db } = await createApp();
    const created = (await postQuote(app)).json();
    const claim = await app.inject({ method: "POST", url: "/api/internal/orca/jobs/claim", headers: workerHeaders(), payload: { workerId: "test-orca" } });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().job).toMatchObject({ id: created.slicingQuote.id, status: "processing", scope: "public-slicing-quote", quantity: 2, material: "PETG" });
    expect(claim.json().job.sourceFiles).toHaveLength(1);
    expect(claim.json().job).toMatchObject({ layerHeight: 0.2, infill: 18, walls: 3, autoSupports: true });

    const boundary = "orca-real-result";
    const result = await app.inject({
      method: "POST",
      url: `/api/internal/orca/jobs/${created.slicingQuote.id}/result`,
      headers: { ...workerHeaders(), "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipart({
        boundary,
        fields: {
          estimatedMinutes: "142",
          modelGrams: "40.5",
          supportGrams: "6.25",
          otherGrams: "1.75",
          totalGrams: "48.5",
          profileName: "Artillery M1 Pro 0.4 nozzle / 0.20mm Standard / Artillery PETG",
          workerVersion: "2.4.2"
        },
        files: [{ name: "actual.gcode", content: "; generated by OrcaSlicer\nG1 X1 E1" }]
      })
    });
    expect(result.statusCode).toBe(200);
    const fetched = await app.inject({ method: "GET", url: `/api/public/slicing-quotes/${created.slicingQuote.id}?token=${encodeURIComponent(created.accessToken)}` });
    const quote = fetched.json().slicingQuote;
    expect(quote).toMatchObject({
      status: "completed",
      modelGrams: 40.5,
      supportGrams: 6.25,
      otherGrams: 1.75,
      totalGrams: 48.5,
      estimatedMinutes: 142,
      engine: "OrcaSlicer",
      profileName: "Artillery M1 Pro 0.4 nozzle / 0.20mm Standard / Artillery PETG"
    });
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.quote.total).toBe(quote.price);
    expect(quote.quote.input).toMatchObject({ scope: "order", grams: 48.5, minutes: 142, quantity: 2, material: "PETG" });
    expect(db.data.slicingQuotes[0].gcodeFileId).toBeTruthy();
    await app.close();
  });

  it("rejects unsupported materials, invalid formats, excessive file count and invalid worker measurements", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app } = await createApp();
    expect((await postQuote(app, { material: "ABS" })).statusCode).toBe(400);
    expect((await postQuote(app, {}, [{ name: "payload.exe", content: "bad" }])).statusCode).toBe(400);
    expect((await postQuote(app, {}, Array.from({ length: 6 }, (_, index) => ({ name: `${index}.stl`, content: cubeStl })))).statusCode).toBe(400);

    const created = (await postQuote(app, { quantity: 1 })).json();
    await app.inject({ method: "POST", url: "/api/internal/orca/jobs/claim", headers: workerHeaders(), payload: {} });
    const boundary = "invalid-result";
    const invalid = await app.inject({
      method: "POST",
      url: `/api/internal/orca/jobs/${created.slicingQuote.id}/result`,
      headers: { ...workerHeaders(), "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipart({ boundary, fields: { estimatedMinutes: "0", modelGrams: "0", supportGrams: "0", otherGrams: "0", totalGrams: "0", profileName: "reference" }, files: [{ name: "fake.gcode", content: "G1 X0" }] })
    });
    expect(invalid.statusCode).toBe(400);
    const fetched = await app.inject({ method: "GET", url: `/api/public/slicing-quotes/${created.slicingQuote.id}?token=${created.accessToken}` });
    expect(fetched.json().slicingQuote.status).toBe("processing");
    expect(fetched.json().slicingQuote).not.toHaveProperty("price");
    await app.close();
  });
});
