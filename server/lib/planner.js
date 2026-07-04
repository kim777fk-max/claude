// Turn a natural-language editing request into a validated, whitelisted edit
// plan using Claude tool use. The model can ONLY emit the operations defined in
// the tool schema below — there is no free-form command execution — so the plan
// is safe to hand to runPlan.js.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.EDIT_PLANNER_MODEL || "claude-haiku-4-5";

const EDIT_PLAN_TOOL = {
  name: "build_edit_plan",
  description:
    "Produce an ordered list of video edit operations that fulfil the user's request. " +
    "Operations run in sequence: each one takes the output of the previous one as its input.",
  input_schema: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        description: "Ordered edit steps. Empty if the request asks for nothing actionable.",
        items: {
          type: "object",
          properties: {
            op: {
              type: "string",
              enum: ["cut", "telop", "music", "concat"],
              description:
                "cut = keep a time range; telop = burn a caption; music = add BGM; concat = join extra clips after the current one.",
            },
            start: {
              type: "string",
              description:
                "For cut/telop: start time in seconds (e.g. \"5\") or HH:MM:SS. Optional for telop (whole video if omitted).",
            },
            end: {
              type: "string",
              description:
                "For cut: end time, or \"+N\" meaning N seconds from start. For telop: end time of the caption window.",
            },
            text: { type: "string", description: "For telop: the caption text." },
            position: {
              type: "string",
              enum: ["top", "center", "bottom"],
              description: "For telop: where the caption sits (default bottom).",
            },
            music_url: {
              type: "string",
              description: "For music: an http(s) URL to the BGM audio file.",
            },
            music_mode: {
              type: "string",
              enum: ["mix", "replace"],
              description: "For music: mix keeps original audio (default), replace swaps it.",
            },
            music_volume: {
              type: "number",
              description: "For music: BGM volume from 0 to 1 (e.g. 0.2 = quiet, 0.5 = medium). Default 0.25.",
            },
            fade_seconds: {
              type: "number",
              description: "For music: fade-out length in seconds at the end of the video (0 = no fade). Default 2.",
            },
            inputs: {
              type: "array",
              items: { type: "string" },
              description: "For concat: extra clip URLs to append after the current video.",
            },
          },
          required: ["op"],
          additionalProperties: false,
        },
      },
      note: {
        type: "string",
        description: "Short note back to the user about anything ambiguous or skipped.",
      },
    },
    required: ["operations"],
    additionalProperties: false,
  },
};

const SYSTEM = `You are a video-editing planner. Convert the user's request into a concrete
sequence of edit operations using the build_edit_plan tool. Rules:
- Use only cut, telop, music, concat.
- The first clip is the primary video; operations apply to it in sequence.
- When several clips are provided and the user wants to join/merge them, emit a
  single "concat" op whose "inputs" are the OTHER clip URLs (2nd, 3rd, ...) in order.
  Put concat first if later ops (telop/music/cut) should apply to the joined result.
- "music" requires a music_url. If the user didn't provide one, omit the music op and explain in note.
- Pick sensible defaults for unspecified values; mention assumptions in note.
- Always call the tool exactly once.`;

export async function buildEditPlan({ prompt, sourceUrl, extraUrls = [] }) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  let userText = `Primary video URL: ${sourceUrl}\n`;
  if (extraUrls.length) {
    userText += `Additional clips (in order):\n` +
      extraUrls.map((u, i) => `  ${i + 2}. ${u}`).join('\n') + '\n';
  }
  userText += `\nEditing request:\n${prompt}`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    tools: [EDIT_PLAN_TOOL],
    tool_choice: { type: "tool", name: "build_edit_plan" },
    messages: [{ role: "user", content: userText }],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block) throw new Error("planner did not return a plan");
  const plan = block.input || {};
  if (!Array.isArray(plan.operations)) plan.operations = [];
  return plan;
}
