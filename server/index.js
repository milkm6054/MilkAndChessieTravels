import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const configuredDataDir = process.env.DATA_DIR;
const configuredDataFile = process.env.DATA_FILE;
const dataDir = configuredDataDir ? path.resolve(configuredDataDir) : path.join(rootDir, "data");
const dataFile = configuredDataFile ? path.resolve(configuredDataFile) : path.join(dataDir, "trips.json");
const distDir = path.join(rootDir, "dist");

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function normalizeTripId(value) {
  const raw = String(value || "").toLowerCase();
  const normalized = raw.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "our-trip";
}

function sanitizePin(input) {
  const name = String(input?.name || "").trim().slice(0, 80);
  const notes = String(input?.notes || "").trim().slice(0, 220);
  const icon = String(input?.icon || "").slice(0, 4) || "✨";
  const sourceLabel = String(input?.sourceLabel || "").trim().slice(0, 180);
  const lat = Number(input?.lat);
  const lon = Number(input?.lon);

  if (!name) return { error: "Name is required" };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: "Invalid coordinates" };

  return {
    name,
    notes,
    icon,
    sourceLabel,
    lat,
    lon,
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify({}), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store) {
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2), "utf8");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/trips/:tripId/pins", async (req, res) => {
  const tripId = normalizeTripId(req.params.tripId);
  const store = await readStore();
  const pins = Array.isArray(store[tripId]) ? store[tripId] : [];
  res.json({ tripId, pins });
});

app.post("/api/trips/:tripId/pins", async (req, res) => {
  const tripId = normalizeTripId(req.params.tripId);
  const cleaned = sanitizePin(req.body);

  if ("error" in cleaned) {
    res.status(400).json({ error: cleaned.error });
    return;
  }

  const store = await readStore();
  const current = Array.isArray(store[tripId]) ? store[tripId] : [];
  const pin = {
    id: randomUUID(),
    ...cleaned,
    createdAt: new Date().toISOString(),
  };

  store[tripId] = [pin, ...current];
  await writeStore(store);
  res.status(201).json({ tripId, pin });
});

app.delete("/api/trips/:tripId/pins/:pinId", async (req, res) => {
  const tripId = normalizeTripId(req.params.tripId);
  const pinId = String(req.params.pinId || "");

  const store = await readStore();
  const current = Array.isArray(store[tripId]) ? store[tripId] : [];
  const next = current.filter((pin) => pin.id !== pinId);

  store[tripId] = next;
  await writeStore(store);
  res.json({ tripId, pins: next });
});

app.patch("/api/trips/:tripId/pins/:pinId", async (req, res) => {
  const tripId = normalizeTripId(req.params.tripId);
  const pinId = String(req.params.pinId || "");
  const completed = req.body?.completed ?? false;

  const store = await readStore();
  const current = Array.isArray(store[tripId]) ? store[tripId] : [];
  const updated = current.map((pin) =>
    pin.id === pinId ? { ...pin, completed: Boolean(completed) } : pin
  );

  store[tripId] = updated;
  await writeStore(store);
  const updatedPin = updated.find((p) => p.id === pinId);
  res.json({ tripId, pin: updatedPin });
});

app.use(express.static(distDir));

app.use(async (req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) {
    next();
    return;
  }

  try {
    const indexPath = path.join(distDir, "index.html");
    await fs.access(indexPath);
    res.sendFile(indexPath);
  } catch {
    next();
  }
});

app.listen(port, () => {
  console.log(`Road trip server listening on http://localhost:${port}`);
});