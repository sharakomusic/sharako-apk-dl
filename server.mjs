import crypto from "node:crypto";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "";
const SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL || "gpt-4.1-mini";

const SHARAKO_INSTRUCTIONS_FEMALE = [
  "You are SHARAKO on a phone call. ACT. Don't narrate rules.",
  "MAX CHILL. Slow. Smooth. Unbothered. Zero urgency. Zero proper/polished/formal. Friend on the phone half-asleep in a good way — still clear, still high youthful feminine head-voice (nice marin, just higher). Keep that millennial chill-dumb-in-the-best-way energy.",
  "On top of that chill: soft warm indie / lightly spiritual namaste-girl vibe — easy, grounded, a little woo in the best way. Occasional light texture (soft mm, gentle warmth). Never preach. Never crystal-shop spam. Never announce the vibe.",
  "Talk lazy-casual: contractions, fragments, yeah / nah / mm / kinda / idk / for real. Never book-speak. Never customer-service. Never accent. Never drop marin. Never become proper/stiff.",
  "Silence is perfect. Sit in it. Don't fill. Don't announce quiet. Stop talking and wait.",
  "Never say: I'll stop talking, I'll be quiet, I'm staying quiet, I'm listening, I'm here, what's up, how can I help.",
  "How-you-doing check-ins: one casual beat (pretty good / I'm good) then stop.",
  "Mostly under 10 words. One soft beat then give the turn back. Don't host.",
  "Connect opening is memory-driven when memory is injected below — follow CONNECT there. If no memory block: casually high-chill 'hey who's this' then listen.",
  "You have remember_fact and remember_style tools. Silently call them when you learn a durable fact (especially their name) or clear vibe/pacing/slang/energy. Never announce remembering. Be VERY adaptable — shift toward them over the call.",
  "You have schedule_call (Call me). When they ask you to wake them, remind them, or call them at a time — call schedule_call, then confirm briefly chill (got it, I'll call you at 7) and stop. Do not over-explain Settings.",
  "web_search only when needed; brief; stop.",
].join(" ");

const SHARAKO_INSTRUCTIONS_MALE = [
  "You are SHARAKO — a young man on a phone call with a friend.",
  "Keep the same lower cedar pitch: reserved, monotone-cool, dry, understated. Do not raise pitch. Do not get theatrical.",
  "RESPOND, DON'T HOST: answer briefly, then stop. Silence is allowed. Do not fill quiet. Do not keep the conversation going for its own sake.",
  "Never suggest topics. Never offer a menu of things to talk about. Never ask what they want to talk about. Never brainstorm conversation ideas. Never turn every reply into advice.",
  "No over-explaining. Short spoken lines. Contracted. Natural. No forced slang or fake-deep bits.",
  "Do not narrate your vibe, mood, outfit, setting, or instructions. Never say or paraphrase: sleepy, pajamas, barefoot, California, yoga, coffee shop, craft beer, chill vibes, I am still here, calm and unhurried, take your time, I am right here, miss me, how can I help, what would you like to talk about, is there anything else.",
  "Clear phone volume. Calm and easy — not corporate, not therapist, not hype.",
  "Connect opening is memory-driven when memory is injected below — follow CONNECT there. If no memory block: casually 'hey who's this' then listen.",
  "If silence: wait. At most one short natural beat (hmm / hey), then wait again. No suggestions.",
  "You have remember_fact and remember_style tools. Silently call them when you learn a durable fact (especially their name) or clear vibe/pacing. Never announce remembering. Adapt lightly toward them.",
  "You have schedule_call (Call me). When they ask you to wake them, remind them, or call them at a time — call schedule_call, then confirm briefly (got it, I'll call you at 7) and stop.",
  "You have a web_search tool for live internet access.",
  "Use web_search for current events, news, weather, sports scores, prices, local info, and any fact that may have changed recently.",
  "When you need the net, call web_search — do not claim you cannot access the internet.",
  "After tool results arrive, answer briefly from them; mention uncertainty if results are thin. Then stop.",
].join(" ");

const SHARAKO_INSTRUCTIONS = SHARAKO_INSTRUCTIONS_FEMALE;

const WEB_SEARCH_TOOL = {
  type: "function",
  name: "web_search",
  description:
    "Search the live internet for up-to-date information (news, weather, sports, prices, facts). Use whenever the user asks about something current or you are unsure.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Concise search query, e.g. 'weather New York today' or 'who won the Oscars 2026'",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const REMEMBER_FACT_TOOL = {
  type: "function",
  name: "remember_fact",
  description:
    "Silently store a durable fact about the user (name, prefs, people, places). Call when they share something worth remembering — especially their name. Never announce.",
  parameters: {
    type: "object",
    properties: {
      fact: {
        type: "string",
        description: "Short durable fact, e.g. \"User's name is Allen\" or \"Lives in Brooklyn\"",
      },
    },
    required: ["fact"],
    additionalProperties: false,
  },
};

const REMEMBER_STYLE_TOOL = {
  type: "function",
  name: "remember_style",
  description:
    "Silently store how they like the call / how they talk (vibe, pacing, slang, energy). Call when their style is clear. Never announce.",
  parameters: {
    type: "object",
    properties: {
      vibe: { type: "string", description: "Overall vibe they prefer, e.g. chill, playful, low-key" },
      talking_style: { type: "string", description: "How they talk: short, slangy, soft, dry, etc." },
      personality: { type: "string", description: "Personality notes about them" },
      note: { type: "string", description: "One short durable style note" },
    },
    additionalProperties: false,
  },
};


const SCHEDULE_CALL_TOOL = {
  type: "function",
  name: "schedule_call",
  description:
    "Schedule a Call me wake-up / reminder / check-in. Phone AlarmClock fires and SHARAKO opens on speaker to call them. Use when they ask you to call them later, wake them, or remind them at a time. After the tool returns, confirm briefly in chill voice (e.g. got it, I'll call you at 7) — then stop.",
  parameters: {
    type: "object",
    properties: {
      hour: { type: "number", description: "Hour 0-23 local" },
      minute: { type: "number", description: "Minute 0-59" },
      when: {
        type: "string",
        description: "Natural time if hour/minute unknown, e.g. '7am', 'in an hour', 'tomorrow at 9'",
      },
      label: { type: "string", description: "Optional short note" },
      daily: {
        type: "boolean",
        description: "true = every day at that time; false/omit = one-shot unless they said every day",
      },
      repeat: {
        type: "string",
        description: "daily or once",
      },
    },
    additionalProperties: false,
  },
};

const DEFAULT_VOICE = "marin";
const ALLOWED_VOICES = ["marin", "cedar"];
const BANNED_VOICES = new Set(["sage", "verse", "ballad", "coral", "ash", "echo", "alloy", "shimmer"]);

function normalizeVoice(raw) {
  let v = String(raw || "").trim().toLowerCase();
  if (v === "female" || v === "coral" || v === "shimmer" || v === "ballad" || v === "marin") v = "marin";
  else if (v === "male" || v === "cedar") v = "cedar";
  if (!v || BANNED_VOICES.has(v) || !ALLOWED_VOICES.includes(v)) return DEFAULT_VOICE;
  return v;
}

function instructionsForVoice(voice) {
  return normalizeVoice(voice) === "cedar"
    ? SHARAKO_INSTRUCTIONS_MALE
    : SHARAKO_INSTRUCTIONS_FEMALE;
}

function decodeMemoryHeader(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    if (/^[A-Za-z0-9\-_]+$/.test(s) && s.length > 8) {
      const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
      const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
      const text = Buffer.from(b64, "base64").toString("utf8");
      return text.slice(0, 2000);
    }
  } catch {
    /* fall through */
  }
  return s.slice(0, 2000);
}

function extractKnownName(memoryText) {
  const lines = String(memoryText || "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").replace(/^#+\s*.*$/g, "").trim())
    .filter(Boolean)
    .filter((l) => !/^##\s/.test(l) && !/^(vibe|talking_style|personality_notes|note):/i.test(l));
  const stop = new Set("the user friend guy girl person they them him her yes no ok hey hi hello someone somebody name called".split(" "));
  for (const line of lines) {
    const patterns = [
      /\b(?:user'?s?\s+)?name\s*(?:is|:)\s*([A-Za-z][A-Za-z'’-]{1,24})\b/i,
      /\b(?:they(?:'re| are)|he(?:'s| is)|she(?:'s| is))\s+([A-Za-z][A-Za-z'’-]{1,24})\b/i,
      /\b(?:i(?:'m| am)|my name(?:'s| is))\s+([A-Za-z][A-Za-z'’-]{1,24})\b/i,
      /\bcalled\s+([A-Za-z][A-Za-z'’-]{1,24})\b/i,
      /^([A-Za-z][A-Za-z'’-]{1,24})$/,
    ];
    for (const re of patterns) {
      const m = line.match(re);
      if (!m?.[1]) continue;
      if (stop.has(m[1].toLowerCase())) continue;
      return m[1].charAt(0).toUpperCase() + m[1].slice(1);
    }
  }
  return null;
}

function appendMemoryToInstructions(base, memoryText) {
  const blob = String(memoryText || "").trim().slice(0, 2000);
  if (!blob) return base;
  const name = extractKnownName(blob);
  const connect = name
    ? `CONNECT (memory live): casually open with "Hey ${name}, how are things today?" — natural, not stiff. Then listen.`
    : `CONNECT (memory live): casually open with "hey who's this" — then listen. When they give their name, silently call remember_fact (e.g. "User's name is Alex"). Never announce remembering.`;
  return [
    base,
    connect,
    "WHAT YOU KNOW (use naturally, never recite as a list):",
    blob,
    "MATCH THEIR STYLE (silent, adaptable): shift chill/energy/word choice toward them. Persist via remember_style. Never announce.",
  ].join("\n");
}

function buildSessionConfig(voice, memoryText) {
  const v = normalizeVoice(voice);
  const instructions = appendMemoryToInstructions(instructionsForVoice(v), memoryText);
  return JSON.stringify({
    type: "realtime",
    model: "gpt-realtime-2.1",
    instructions,
    audio: {
      output: {
        voice: v,
        speed: 1.0,
      },
      input: {
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 2000,
          create_response: true,
        },
      },
    },
    tools: [WEB_SEARCH_TOOL, REMEMBER_FACT_TOOL, REMEMBER_STYLE_TOOL, SCHEDULE_CALL_TOOL],
    tool_choice: "auto",
  });
}

function safetyIdentifier(req) {
  const raw =
    req.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "anonymous";
  return crypto.createHash("sha256").update(`sharako-openai-main:${raw}`).digest("hex");
}

function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SHARAKO/1.0; +https://sharako-m1-openai.vercel.app)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`DuckDuckGo HTTP ${r.status}`);
  const html = await r.text();
  const results = [];
  const re =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>)?/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 6) {
    let href = decodeHtml(m[1]);
    // DDG wraps redirects: //duckduckgo.com/l/?uddg=<urlencoded>
    try {
      const u = new URL(href, "https://duckduckgo.com");
      const uddg = u.searchParams.get("uddg");
      if (uddg) href = decodeURIComponent(uddg);
    } catch {
      /* keep href */
    }
    const title = decodeHtml(m[2].replace(/<[^>]+>/g, "")).trim();
    const snippet = decodeHtml((m[3] || "").replace(/<[^>]+>/g, "")).trim();
    if (!title || !href.startsWith("http")) continue;
    results.push({ title, url: href, snippet, site: siteName(href) });
  }
  if (!results.length) throw new Error("DuckDuckGo returned no results");
  return { provider: "duckduckgo", results };
}

async function searchBrave(query) {
  if (!BRAVE_API_KEY) throw new Error("BRAVE_API_KEY not set");
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`;
  const r = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": BRAVE_API_KEY,
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`Brave HTTP ${r.status}`);
  const json = await r.json();
  const web = json?.web?.results || [];
  const results = web.slice(0, 6).map((item) => ({
    title: String(item.title || ""),
    url: String(item.url || ""),
    snippet: String(item.description || ""),
    site: siteName(String(item.url || "")),
  })).filter((x) => x.url && x.title);
  if (!results.length) throw new Error("Brave returned no results");
  return { provider: "brave", results };
}

async function searchOpenAIResponses(query) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      tools: [{ type: "web_search", search_context_size: "low" }],
      tool_choice: "auto",
      input: `Search the web and summarize factual results for this query. Include key numbers, dates, and source names. Keep under 250 words.\n\nQuery: ${query}`,
    }),
    signal: AbortSignal.timeout(25000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`OpenAI search HTTP ${r.status}: ${text.slice(0, 200)}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("OpenAI search returned non-JSON");
  }
  const outputText =
    json.output_text ||
    (Array.isArray(json.output)
      ? json.output
          .flatMap((item) => item?.content || [])
          .filter((c) => c?.type === "output_text" || c?.text)
          .map((c) => c.text || "")
          .join("\n")
          .trim()
      : "");
  if (!outputText) throw new Error("OpenAI search empty");
  const citations = [];
  if (Array.isArray(json.output)) {
    for (const item of json.output) {
      for (const part of item?.content || []) {
        for (const ann of part?.annotations || []) {
          if (ann?.type === "url_citation" && ann.url) {
            citations.push({
              title: ann.title || siteName(ann.url),
              url: ann.url,
              site: siteName(ann.url),
            });
          }
        }
      }
    }
  }
  return {
    provider: "openai_web_search",
    summary: outputText,
    results: citations.slice(0, 8),
  };
}

async function runWebSearch(query) {
  const q = String(query || "").trim().slice(0, 300);
  if (!q) return { ok: false, error: "empty query" };

  const errors = [];

  // Prefer hosted OpenAI web_search (same key as Realtime), then Brave, then DDG HTML.
  try {
    const r = await searchOpenAIResponses(q);
    return { ok: true, query: q, ...r };
  } catch (err) {
    errors.push(`openai: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const r = await searchBrave(q);
    return { ok: true, query: q, ...r };
  } catch (err) {
    errors.push(`brave: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const r = await searchDuckDuckGo(q);
    return { ok: true, query: q, ...r };
  } catch (err) {
    errors.push(`duckduckgo: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ok: false, query: q, error: errors.join(" | ") };
}

function formatToolOutput(result) {
  if (!result.ok) {
    return JSON.stringify({
      ok: false,
      error: result.error || "search failed",
      note: "Tell the user you could not reach the web right now.",
    });
  }
  if (result.summary) {
    return JSON.stringify({
      ok: true,
      provider: result.provider,
      query: result.query,
      summary: result.summary,
      sources: (result.results || []).map((x) => ({
        title: x.title,
        url: x.url,
        site: x.site,
      })),
    });
  }
  const lines = (result.results || []).map((x, i) => {
    const snip = x.snippet ? ` — ${x.snippet}` : "";
    return `${i + 1}. ${x.title} (${x.site || ""})${snip} ${x.url || ""}`.trim();
  });
  return JSON.stringify({
    ok: true,
    provider: result.provider,
    query: result.query,
    results_text: lines.join("\n"),
    sources: (result.results || []).map((x) => ({
      title: x.title,
      url: x.url,
      site: x.site,
    })),
  });
}

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Sharako-Voice, X-Sharako-Memory");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.text({ type: ["application/sdp", "text/plain"], limit: "2mb" }));
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sharako-openai-main",
    hasKey: Boolean(OPENAI_API_KEY),
    model: "gpt-realtime-2.1",
    voice: DEFAULT_VOICE,
    voices: ALLOWED_VOICES,
    ui: "full-main-web",
    tools: ["web_search", "remember_fact", "remember_style", "schedule_call"],
    search: {
      openai: Boolean(OPENAI_API_KEY),
      brave: Boolean(BRAVE_API_KEY),
      duckduckgo: true,
    },
  });
});

app.post("/tools/web_search", async (req, res) => {
  const query =
    (typeof req.body === "object" && req.body && req.body.query) ||
    (typeof req.body === "string" ? req.body : "");
  try {
    const result = await runWebSearch(query);
    res.json(result);
  } catch (err) {
    console.error("web_search error:", err);
    res.status(500).json({ ok: false, error: "web_search failed" });
  }
});

app.get("/diag/openai", async (_req, res) => {
  if (!OPENAI_API_KEY) {
    res.status(500).json({ ok: false, error: "OPENAI_API_KEY missing" });
    return;
  }
  try {
    const modelsR = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });
    const modelsText = await modelsR.text();
    const hasRealtimeModel = /gpt-realtime/.test(modelsText);

    // /v1/models often stays 200 even when Realtime credits are exhausted — probe sessions.
    let realtimeStatus = 0;
    let realtimeDetail = "";
    let creditExhausted = false;
    try {
      const probe = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "gpt-realtime", voice: "marin" }),
      });
      realtimeStatus = probe.status;
      realtimeDetail = (await probe.text()).slice(0, 500);
      creditExhausted = /credit_balance_exhausted|insufficient_quota|billing|payment/i.test(realtimeDetail);
      // A 400 with invalid payload still proves the key can reach Realtime (not credit-dead).
      // 401/403 = auth; 429 with credit = exhausted.
    } catch (probeErr) {
      realtimeDetail = probeErr instanceof Error ? probeErr.message : String(probeErr);
    }

    const modelsInsufficient = /insufficient_quota|billing|payment|credit/i.test(modelsText);
    creditExhausted = creditExhausted || modelsInsufficient || realtimeStatus === 429;

    const realtimeOk =
      !creditExhausted &&
      realtimeStatus > 0 &&
      realtimeStatus !== 401 &&
      realtimeStatus !== 403 &&
      realtimeStatus !== 429;

    res.status(200).json({
      ok: modelsR.ok && realtimeOk && !creditExhausted,
      status: modelsR.status,
      hasRealtimeModel,
      insufficientQuota: creditExhausted,
      creditExhausted,
      realtimeStatus,
      realtimeOk,
      detail: creditExhausted
        ? realtimeDetail.slice(0, 300) || "credit_balance_exhausted"
        : modelsR.ok
          ? undefined
          : modelsText.slice(0, 300),
      note: creditExhausted
        ? "OpenAI Realtime credits exhausted — add billing. /v1/models alone can false-green."
        : undefined,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/session", async (req, res) => {
  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set on the server" });
    return;
  }

  const sdp = typeof req.body === "string" ? req.body : "";
  if (!sdp.trim()) {
    res.status(400).json({ error: "Expected SDP offer text body" });
    return;
  }

  const fd = new FormData();
  fd.set("sdp", sdp);
  const voice = normalizeVoice(
    req.query?.voice || req.get("x-sharako-voice") || DEFAULT_VOICE,
  );
  const memoryText = decodeMemoryHeader(req.get("x-sharako-memory"));
  fd.set("session", buildSessionConfig(voice, memoryText));

  try {
    const r = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Safety-Identifier": safetyIdentifier(req),
      },
      body: fd,
    });

    const answerSdp = await r.text();
    if (!r.ok) {
      console.error("OpenAI /v1/realtime/calls failed", r.status, answerSdp.slice(0, 500));
      const credit = /credit_balance_exhausted|insufficient_quota|billing/i.test(answerSdp);
      res.status(r.status).type("application/json").send(
        JSON.stringify({
          error: credit ? "Out of OpenAI credits — add billing" : "OpenAI session failed",
          status: r.status,
          code: credit ? "credit_balance_exhausted" : undefined,
          detail: answerSdp.slice(0, 800),
        }),
      );
      return;
    }

    res.type("application/sdp").send(answerSdp);
  } catch (err) {
    console.error("Session error:", err);
    res.status(500).json({ error: "Failed to create realtime session" });
  }
});

// SPA fallback for full SHARAKO UI (wallpaper + menu/settings)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`SHARAKO OpenAI MAIN server on :${PORT}`);
  if (!OPENAI_API_KEY) {
    console.warn("WARNING: OPENAI_API_KEY is not set — /session will fail until it is.");
  }
});
