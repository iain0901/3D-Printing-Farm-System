import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer, openDatabase } from "./server.mjs";
import { FREE_PRINT_STATION_IDS } from "./cases-module.mjs";
import { freePrintStations } from "../frontend-vue/src/content/freePrintStations.mjs";
import { testStl } from "./test-helpers/stl.mjs";

const cleanups = [];
afterEach(async () => {
  delete process.env.LAYERPILOT_WORKER_TOKEN;
  while (cleanups.length)
    await rm(cleanups.pop(), { recursive: true, force: true });
});

const cubeStl = testStl();

function multipart({ boundary, files = [], payload, fields = {} }) {
  const chunks = [];
  const field = (name, value) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
    );
  };
  if (payload !== undefined) field("payload", JSON.stringify(payload));
  for (const [name, value] of Object.entries(fields)) field(name, value);
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      )
    );
    chunks.push(
      Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content)
    );
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

async function createApp() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "farmflow-public-slice-")
  );
  cleanups.push(directory);
  const dbFile = path.join(directory, "state.json");
  const db = await openDatabase(dbFile);
  const app = await buildServer({ db, serveStatic: false });
  return { app, db, dbFile };
}

const postQuote = (
  app,
  payload = {},
  files = [{ name: "cube.stl", content: cubeStl }]
) => {
  const boundary = `quote-${Math.random().toString(16).slice(2)}`;
  return app.inject({
    method: "POST",
    url: "/api/public/slicing-quotes",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: multipart({
      boundary,
      files,
      payload: {
        material: "PETG",
        quantity: 2,
        layerHeight: 0.2,
        infill: 18,
        walls: 3,
        autoSupports: true,
        ...payload,
      },
    }),
  });
};

const workerHeaders = () => ({
  "x-layerpilot-worker-token": "test-worker-token",
});

describe("public real Orca slicing quote jobs", () => {
  it("slices a standalone studio project without a price and authorizes real 3D paths by its private token", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app, db } = await createApp();
    const counts = [
      db.data.cases.length,
      db.data.orders.length,
      db.data.queue.length,
    ];
    const created = await postQuote(app, {
      purpose: "studio",
      material: "PLA",
      quantity: 1,
      autoOrient: false,
      autoArrange: false,
      placements: [{ x: 130, y: 130 }],
      advanced: {
        infillPattern: "gyroid",
        supportOnBuildPlate: true,
        retractionLength: 0.8,
      },
    });
    expect(created.statusCode, created.body).toBe(202);
    const job = created.json(),
      url = `/api/public/slicing-quotes/${job.slicingQuote.id}`,
      headers = { "x-slicing-token": job.accessToken };
    expect(job.slicingQuote).not.toHaveProperty("price");
    const claim = await app.inject({
      method: "POST",
      url: "/api/internal/orca/jobs/claim",
      headers: workerHeaders(),
      payload: {},
    });
    expect(claim.json().job).toMatchObject({
      purpose: "studio",
      advanced: {
        infillPattern: "gyroid",
        supportOnBuildPlate: true,
        retractionLength: 0.8,
      },
    });
    const boundary = "studio-result";
    const result = await app.inject({
      method: "POST",
      url: `/api/internal/orca/jobs/${job.slicingQuote.id}/result`,
      headers: {
        ...workerHeaders(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipart({
        boundary,
        fields: {
          estimatedMinutes: "10",
          modelGrams: "2",
          supportGrams: "1",
          otherGrams: "0",
          totalGrams: "3",
          profileName: "reference-test",
        },
        files: [
          {
            name: "studio.gcode",
            content:
              "G90\nM83\nG1 Z0.2\n; FEATURE: Outer wall\nG1 X10 E1 F1200\n; FEATURE: Support\nG1 Y10 E1\nG1 Z0.4\nG1 X0 E1\n",
          },
        ],
      }),
    });
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().slicingQuote).not.toHaveProperty("price");
    expect(db.data.slicingQuotes[0]).not.toHaveProperty("quote");
    expect((await app.inject({ url: url + "/toolpaths" })).statusCode).toBe(
      404
    );
    expect(
      (
        await app.inject({
          url: url + "/toolpaths",
          headers: { "x-slicing-token": "wrong" },
        })
      ).statusCode
    ).toBe(404);
    const preview = await app.inject({ url: url + "/toolpaths", headers });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.headers["cache-control"]).toBe("no-store");
    expect(preview.json().preview.layers.map((l) => l.z)).toEqual([0.2, 0.4]);
    expect(preview.json().preview.layers[0].segments[0]).toMatchObject({
      from: [0, 0, 0.2],
      to: [10, 0, 0.2],
      role: "outer",
      speed: 20,
    });
    expect([
      db.data.cases.length,
      db.data.orders.length,
      db.data.queue.length,
    ]).toEqual(counts);
    await app.close();
  });
  it("cancels only token-owned station jobs and refuses late worker results", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app } = await createApp();
    const paid = (await postQuote(app)).json();
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/public/slicing-quotes/${paid.slicingQuote.id}`,
          headers: { "x-slicing-token": paid.accessToken },
        })
      ).statusCode
    ).toBe(404);
    for (const processing of [false, true]) {
      const created = (
        await postQuote(app, {
          purpose: "free-print",
          stationId: "nthu-shuimu",
          quantity: 1,
        })
      ).json();
      if (processing) {
        // The paid quote remains first in FIFO; claim it and then the station job.
        await app.inject({
          method: "POST",
          url: "/api/internal/orca/jobs/claim",
          headers: workerHeaders(),
          payload: {},
        });
        await app.inject({
          method: "POST",
          url: "/api/internal/orca/jobs/claim",
          headers: workerHeaders(),
          payload: {},
        });
      }
      const url = `/api/public/slicing-quotes/${created.slicingQuote.id}`;
      expect(
        (
          await app.inject({
            method: "DELETE",
            url,
            headers: { "x-slicing-token": "wrong" },
          })
        ).statusCode
      ).toBe(404);
      const cancelled = await app.inject({
        method: "DELETE",
        url,
        headers: { "x-slicing-token": created.accessToken },
      });
      expect(cancelled.json().slicingQuote.status).toBe("cancelled");
      const late = await app.inject({
        method: "POST",
        url: `/api/internal/orca/jobs/${created.slicingQuote.id}/result`,
        headers: {
          ...workerHeaders(),
          "content-type": "multipart/form-data; boundary=late-result",
        },
        payload: multipart({
          boundary: "late-result",
          files: [{ name: "late.gcode", content: "G1 X1 E1" }],
        }),
      });
      expect(late.statusCode).toBe(409);
    }
    await app.close();
  });
  it("keeps the public station registry aligned with the server allowlist", () => {
    expect(FREE_PRINT_STATION_IDS).toEqual(
      freePrintStations.map((station) => station.id)
    );
  });

  it("validates station materials, model counts and settings before storing files", async () => {
    const { app, db } = await createApp();
    const before = db.data.files.length;
    const free = {
      purpose: "free-print",
      stationId: "nthu-shuimu",
      quantity: 1,
    };
    for (const invalid of [
      { material: "PLA" },
      { stationId: "unknown" },
      { stationId: undefined },
      { quantity: 2 },
      { quantities: [2] },
      { layerHeight: 0.4 },
      { autoArrange: false },
      {
        autoOrient: true,
        autoArrange: false,
        placements: [{ x: 130, y: 130 }],
      },
    ]) {
      expect((await postQuote(app, { ...free, ...invalid })).statusCode).toBe(
        400
      );
    }
    expect(
      (await postQuote(app, free, [{ name: "project.3mf", content: "bad" }]))
        .statusCode
    ).toBe(400);
    expect(
      (
        await postQuote(
          app,
          free,
          Array.from({ length: 6 }, (_, i) => ({
            name: `${i}.stl`,
            content: cubeStl,
          }))
        )
      ).statusCode
    ).toBe(400);
    expect(db.data.files.length).toBe(before);
    await app.close();
  });

  it("preserves validated multi-model placements and locks the display material without changing PETG parameters", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app } = await createApp();
    const payload = {
      purpose: "free-print",
      stationId: "nthu-shuimu",
      quantity: 1,
      autoOrient: false,
      autoArrange: false,
      placements: [
        { x: 40, y: 50 },
        { x: 90, y: 100 },
      ],
    };
    const files = [
      { name: "a.stl", content: cubeStl },
      { name: "b.stl", content: cubeStl },
    ];
    expect(
      (
        await postQuote(
          app,
          {
            ...payload,
            placements: [
              { x: 1, y: 50 },
              { x: 90, y: 100 },
            ],
          },
          files
        )
      ).statusCode
    ).toBe(400);
    expect(
      (
        await postQuote(
          app,
          {
            ...payload,
            placements: [
              { x: 40, y: 50 },
              { x: 40, y: 50 },
            ],
          },
          files
        )
      ).statusCode
    ).toBe(400);
    const created = await postQuote(app, payload, files);
    expect(created.statusCode).toBe(202);
    expect(created.json().slicingQuote).toMatchObject({
      material: "PETG",
      materialLabel: "3DSTU_PETG",
      autoArrange: false,
      fileCount: 2,
      placements: payload.placements,
    });
    const claim = await app.inject({
      method: "POST",
      url: "/api/internal/orca/jobs/claim",
      headers: workerHeaders(),
      payload: {},
    });
    expect(claim.json().job).toMatchObject({
      material: "PETG",
      autoOrient: false,
      autoArrange: false,
      placements: payload.placements,
    });
    expect(claim.json().job.sourceFiles).toHaveLength(2);
    await app.close();
  });

  it("returns token-scoped actual layers for a station slice without a price, order or print queue", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app, db } = await createApp();
    const counts = [db.data.cases.length, db.data.queue.length];
    const created = (
      await postQuote(app, {
        purpose: "free-print",
        stationId: "nthu-shuimu",
        quantity: 1,
        autoOrient: false,
      })
    ).json();
    expect(created.slicingQuote).toMatchObject({
      purpose: "free-print",
      stationId: "nthu-shuimu",
      autoOrient: false,
    });
    const url = `/api/public/slicing-quotes/${created.slicingQuote.id}`;
    const headers = { "x-slicing-token": created.accessToken };
    expect(
      (await app.inject({ url: `${url}/layers`, headers })).statusCode
    ).toBe(409);
    const claim = await app.inject({
      method: "POST",
      url: "/api/internal/orca/jobs/claim",
      headers: workerHeaders(),
      payload: {},
    });
    expect(claim.json().job).toMatchObject({
      purpose: "free-print",
      stationId: "nthu-shuimu",
      autoOrient: false,
    });
    const boundary = "free-station-result";
    const result = await app.inject({
      method: "POST",
      url: `/api/internal/orca/jobs/${created.slicingQuote.id}/result`,
      headers: {
        ...workerHeaders(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipart({
        boundary,
        fields: {
          estimatedMinutes: "10",
          modelGrams: "2",
          supportGrams: "1",
          otherGrams: "0",
          totalGrams: "3",
          profileName: "reference-test-profile",
        },
        files: [
          {
            name: "test.gcode",
            content:
              "G90\nM83\nG1 Z0.2\nG1 X10 E1\nG1 Y10 E1\nG1 Z0.4\nG1 X0 E1\n",
          },
        ],
      }),
    });
    expect(result.statusCode).toBe(200);
    const fetched = await app.inject({ url, headers });
    expect(fetched.headers["cache-control"]).toBe("no-store");
    expect(fetched.json().slicingQuote).toMatchObject({
      status: "completed",
      estimatedMinutes: 10,
      totalGrams: 3,
    });
    expect(fetched.json().slicingQuote).not.toHaveProperty("price");
    expect(db.data.slicingQuotes[0]).not.toHaveProperty("quote");
    expect(fetched.json().slicingQuote).not.toHaveProperty("gcodeFileId");
    for (const wrongHeaders of [{}, { "x-slicing-token": "wrong" }])
      expect(
        (await app.inject({ url: `${url}/layers`, headers: wrongHeaders }))
          .statusCode
      ).toBe(404);
    const preview = (await app.inject({ url: `${url}/layers`, headers })).json()
      .preview;
    expect(preview.layers).toEqual([
      {
        z: 0.2,
        moves: 2,
        segments: [
          [0, 0, 10, 0],
          [10, 0, 10, 10],
        ],
      },
      { z: 0.4, moves: 1, segments: [[10, 10, 0, 10]] },
    ]);
    expect([db.data.cases.length, db.data.queue.length]).toEqual(counts);
    await app.close();
  });
  it("persists a token-scoped queued job and never presents it as a completed quote", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app, db, dbFile } = await createApp();
    const created = await postQuote(app);
    expect(created.statusCode).toBe(202);
    const body = created.json();
    expect(body).toMatchObject({
      ok: true,
      slicingQuote: {
        status: "queued",
        material: "PETG",
        quantity: 2,
        engine: "OrcaSlicer",
        autoOrient: true,
        autoArrange: true,
        autoSupports: true,
      },
    });
    expect(body.accessToken.length).toBeGreaterThanOrEqual(32);
    expect(body.slicingQuote).not.toHaveProperty("quote");
    expect(body.slicingQuote).not.toHaveProperty("price");
    expect(db.data.slicingQuotes).toHaveLength(1);
    expect(db.data.slicingQuotes[0]).not.toHaveProperty("accessToken");
    expect(db.data.slicingQuotes[0].publicAccessTokenHash).not.toContain(
      body.accessToken
    );

    const denied = await app.inject({
      method: "GET",
      url: `/api/public/slicing-quotes/${body.slicingQuote.id}?token=wrong-token-value-that-is-long-enough`,
    });
    expect(denied.statusCode).toBe(404);
    const fetched = await app.inject({
      method: "GET",
      url: `/api/public/slicing-quotes/${
        body.slicingQuote.id
      }?token=${encodeURIComponent(body.accessToken)}`,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().slicingQuote.status).toBe("queued");
    await app.close();
    const reopened = await openDatabase(dbFile);
    expect(reopened.data.slicingQuotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: body.slicingQuote.id, status: "queued" }),
      ])
    );
    await reopened.close?.();
  });

  it("uses the protected existing worker queue and derives the final price only from worker measurements", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app, db } = await createApp();
    const created = (await postQuote(app)).json();
    const claim = await app.inject({
      method: "POST",
      url: "/api/internal/orca/jobs/claim",
      headers: workerHeaders(),
      payload: { workerId: "test-orca" },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().job).toMatchObject({
      id: created.slicingQuote.id,
      status: "processing",
      scope: "public-slicing-quote",
      quantity: 2,
      material: "PETG",
    });
    expect(claim.json().job.sourceFiles).toHaveLength(1);
    expect(claim.json().job).toMatchObject({
      layerHeight: 0.2,
      infill: 18,
      walls: 3,
      autoSupports: true,
    });

    const boundary = "orca-real-result";
    const result = await app.inject({
      method: "POST",
      url: `/api/internal/orca/jobs/${created.slicingQuote.id}/result`,
      headers: {
        ...workerHeaders(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipart({
        boundary,
        fields: {
          estimatedMinutes: "142",
          modelGrams: "40.5",
          supportGrams: "6.25",
          otherGrams: "1.75",
          totalGrams: "48.5",
          profileName:
            "Artillery M1 Pro 0.4 nozzle / 0.20mm Standard / Artillery PETG",
          workerVersion: "2.4.2",
        },
        files: [
          {
            name: "actual.gcode",
            content: "; generated by OrcaSlicer\nG1 X1 E1",
          },
        ],
      }),
    });
    expect(result.statusCode).toBe(200);
    const fetched = await app.inject({
      method: "GET",
      url: `/api/public/slicing-quotes/${
        created.slicingQuote.id
      }?token=${encodeURIComponent(created.accessToken)}`,
    });
    const quote = fetched.json().slicingQuote;
    expect(quote).toMatchObject({
      status: "completed",
      modelGrams: 40.5,
      supportGrams: 6.25,
      otherGrams: 1.75,
      totalGrams: 48.5,
      estimatedMinutes: 142,
      engine: "OrcaSlicer",
      profileName:
        "Artillery M1 Pro 0.4 nozzle / 0.20mm Standard / Artillery PETG",
    });
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.quote.total).toBe(quote.price);
    expect(quote.quote.input).toMatchObject({
      scope: "order",
      grams: 48.5,
      minutes: 142,
      quantity: 2,
      material: "PETG",
    });
    expect(db.data.slicingQuotes[0].gcodeFileId).toBeTruthy();
    await app.close();
  });

  it("rejects unsupported materials, invalid formats, excessive file count and invalid worker measurements", async () => {
    process.env.LAYERPILOT_WORKER_TOKEN = "test-worker-token";
    const { app } = await createApp();
    expect((await postQuote(app, { material: "ABS" })).statusCode).toBe(400);
    expect(
      (await postQuote(app, {}, [{ name: "payload.exe", content: "bad" }]))
        .statusCode
    ).toBe(400);
    expect(
      (
        await postQuote(
          app,
          {},
          Array.from({ length: 6 }, (_, index) => ({
            name: `${index}.stl`,
            content: cubeStl,
          }))
        )
      ).statusCode
    ).toBe(400);

    const created = (await postQuote(app, { quantity: 1 })).json();
    await app.inject({
      method: "POST",
      url: "/api/internal/orca/jobs/claim",
      headers: workerHeaders(),
      payload: {},
    });
    const boundary = "invalid-result";
    const invalid = await app.inject({
      method: "POST",
      url: `/api/internal/orca/jobs/${created.slicingQuote.id}/result`,
      headers: {
        ...workerHeaders(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipart({
        boundary,
        fields: {
          estimatedMinutes: "0",
          modelGrams: "0",
          supportGrams: "0",
          otherGrams: "0",
          totalGrams: "0",
          profileName: "reference",
        },
        files: [{ name: "fake.gcode", content: "G1 X0" }],
      }),
    });
    expect(invalid.statusCode).toBe(400);
    const fetched = await app.inject({
      method: "GET",
      url: `/api/public/slicing-quotes/${created.slicingQuote.id}?token=${created.accessToken}`,
    });
    expect(fetched.json().slicingQuote.status).toBe("processing");
    expect(fetched.json().slicingQuote).not.toHaveProperty("price");
    await app.close();
  });
});
