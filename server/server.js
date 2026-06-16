// Backend for the mobile video-editing app.
//
//   POST /api/sign  → signature for direct *signed* Cloudinary upload from the
//                     browser (no unsigned preset needed; secret stays here).
//   POST /api/edit  → { url, prompt } → Claude plans the edit → ffmpeg runs it
//                     → result uploaded to Cloudinary → { secure_url } returned.
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

// --- auto edit: prompt + source URL → edited video URL ---
app.post("/api/edit", async (req, res) => {
  try {
    const { url, prompt } = req.body || {};
    if (!url || !prompt) {
      return res.status(400).json({ error: "url and prompt are required" });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    }
    const jobId = Date.now().toString(36);
    const plan = await buildEditPlan({ prompt, sourceUrl: url });
    const result = await runPlan({ jobId, sourceUrl: url, plan });
    res.json({ ok: true, plan, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`video-edit backend on :${port}`));
