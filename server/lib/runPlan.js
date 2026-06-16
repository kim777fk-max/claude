// Execute a validated edit plan by calling the repo's ffmpeg scripts, then
// upload the final file to Cloudinary. Only whitelisted ops reach here.
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const SCRIPTS = path.join(REPO, "scripts");
const OUTDIR = path.join(REPO, "media", "out");

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [path.join(SCRIPTS, script), ...args], {
      cwd: REPO,
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed (exit ${code}): ${stderr.slice(-800)}`));
    });
  });
}

// Run one operation; `input` is a URL (first step) or a local path. Returns the
// local output path produced by the script.
async function runOp(op, input, out) {
  switch (op.op) {
    case "cut": {
      if (!op.start || !op.end) throw new Error("cut requires start and end");
      await run("cut.sh", [input, String(op.start), String(op.end), out]);
      return out;
    }
    case "telop": {
      if (!op.text) throw new Error("telop requires text");
      const env = op.position ? { ...process.env, POS: op.position } : process.env;
      const args = [input, op.text, out];
      if (op.start != null && op.end != null) args.push(String(op.start), String(op.end));
      await run2("telop.sh", args, env);
      return out;
    }
    case "music": {
      if (!op.music_url) throw new Error("music requires music_url");
      const env = { ...process.env, MODE: op.music_mode || "mix" };
      await run2("music.sh", [input, op.music_url, out], env);
      return out;
    }
    case "concat": {
      const extra = Array.isArray(op.inputs) ? op.inputs : [];
      if (extra.length < 1) throw new Error("concat requires at least one extra input");
      await run("concat.sh", [out, input, ...extra]);
      return out;
    }
    default:
      throw new Error(`unknown op: ${op.op}`);
  }
}

// Same as run() but with a custom env (telop/music need env vars).
function run2(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [path.join(SCRIPTS, script), ...args], { cwd: REPO, env });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} failed (exit ${code}): ${stderr.slice(-800)}`))
    );
  });
}

export async function runPlan({ jobId, sourceUrl, plan }) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const ops = plan.operations || [];
  if (ops.length === 0) {
    return { skipped: true, note: plan.note || "No actionable edits were requested." };
  }

  let current = sourceUrl;
  let i = 0;
  for (const op of ops) {
    const out = path.join(OUTDIR, `job_${jobId}_${i}.mp4`);
    current = await runOp(op, current, out);
    i++;
  }

  // current is now a local file → upload with the Cloudinary SDK (server-side
  // secret, so no data-URI size limit).
  const folder = process.env.CLOUDINARY_FOLDER || "claude-edits";
  const uploaded = await cloudinary.uploader.upload(current, {
    resource_type: "video",
    folder,
    public_id: `edit_${jobId}`,
    tags: ["claude-auto-edit"],
  });

  // tidy up intermediate files
  for (let k = 0; k < i; k++) {
    fs.rmSync(path.join(OUTDIR, `job_${jobId}_${k}.mp4`), { force: true });
  }

  return {
    skipped: false,
    note: plan.note || "",
    public_id: uploaded.public_id,
    secure_url: uploaded.secure_url,
    duration: uploaded.duration,
    bytes: uploaded.bytes,
  };
}
