// Backend for the mobile video-editing app.
//
//   POST /api/sign     → signature for direct *signed* Cloudinary upload.
//   POST /api/edit     → enqueue an edit job; returns { jobId } immediately
//                        (async, so long videos don't hit HTTP timeouts).
//   GET  /api/job/:id  → poll job status → { status, secure_url, ... }.
//
// Run: cp .env.example .env && fill in keys && npm install && npm start
import "dotenv/config";
import express from "express";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import { buildEditPlan } from "./lib/planner.js";
import { runPlan } from "./lib/runPlan.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const app = express();
app.use(express.json({ limit: "1mb" }));

const origins = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- signed upload params for the browser ---
app.post("/api/sign", (_req, res) => {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !apiKey || !secret) {
    return res.status(500).json({ error: "Cloudinary env not configured" });
  }
  const timestamp = Math.round(Date.now() / 1000);
  const folder = process.env.CLOUDINARY_FOLDER || "claude-edits";
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, secret);
  res.json({ cloudName: cloud, apiKey, timestamp, folder, signature });
});

// --- async edit jobs ---
// In-memory store (single instance). Jobs run one at a time to avoid thrashing
// the CPU; long videos are fine because the HTTP request returns immediately.
const jobs = new Map();
let queue = Promise.resolve();

function pruneJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1h
  for (const [id, j] of jobs) if (j.createdAt < cutoff) jobs.delete(id);
}

app.post("/api/edit", (req, res) => {
  const { url, urls, prompt } = req.body || {};
  const allUrls = Array.isArray(urls) && urls.length ? urls : (url ? [url] : []);
  const sourceUrl = allUrls[0];
  if (!sourceUrl || !prompt) {
    return res.status(400).json({ error: "url (or urls) and prompt are required" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }
  pruneJobs();
  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const job = { id: jobId, status: "queued", createdAt: Date.now() };
  jobs.set(jobId, job);

  // run sequentially via a promise chain
  queue = queue.then(async () => {
    job.status = "running";
    try {
      const plan = await buildEditPlan({ prompt, sourceUrl, extraUrls: allUrls.slice(1) });
      job.plan = plan;
      const result = await runPlan({ jobId, sourceUrl, plan });
      Object.assign(job, { status: "done" }, result);
    } catch (err) {
      console.error(err);
      job.status = "error";
      job.error = String(err.message || err);
    }
  });

  res.status(202).json({ ok: true, jobId, status: "queued" });
});

app.get("/api/job/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "job not found" });
  res.json({ ok: true, ...job });
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`video-edit backend on :${port}`));
