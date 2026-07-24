// background.js — Butterfly service worker

const DEFAULT_MODEL_MODE = 'flash';
const MODEL_CHAINS = {
  flash: [
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ],
  pro: [
    'gemini-2.5-pro',
    'gemini-1.5-pro'
  ]
};
const MAX_TRANSIENT_RETRIES = 1;
const TRANSIENT_RETRY_DELAYS_MS = [400];
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const GEMINI_MODEL_COOLDOWNS = new Map();

// ─── Default style samples ────────────────────────────────────────────────────
// Loaded directly from user_writing_style.md to ensure exact voice alignment

const DEFAULT_STYLE_SAMPLES = [
  "nah I'd win",
  "Being paranoid about duplicate uuid is genuinely hilarious It's almost as difficult as randomly entering someone else wallet key phrase I'm guessing using maybe sha256 might just be better to make the chances of duplicates even more slimmer",
  "That's why humans are superior",
  "Im curious what memory system you use though?",
  "This is why we need open source models to catch up",
  "Damn🤣",
  "Testing as a practice is pretty much more relevant than ever nowadays",
  "Chameleon🤣",
  "Rip 💔",
  "Actually 2 programmers can do in 6 months",
  "To be fair it's all about perceived value And who has the highest impact on the business outcomes of the organization",
  "Rooting for it Biggest bottleneck would probably be navigating the web and bypassing all the antibot preventions that have existed for decades",
  "congrats on the new role!!",
  "yay congrats! 🙂",
  "woohoo!!",
  "Yayyy !!!!! 🎉",
  "R E G A L",
  "🚀 let's go!!!!",
  "congrats!!!!!! 🔥🔥🔥🔥",
  "Valid crash-out tbh",
  "The map integration gives it that scifi vibe😅",
  "Perhaps you should ask AI to fix your responsive layout.",
  "LLM is faster, and good enough. It does not need to be the best.",
  "From a computer science perspective, the architecture behind human beings is vastly superior to the architecture behind LLMs.",
  "SDD-Strawberry Driven Development",
  "our brains are so small yet so incredibly powerful",
  "The intelligence per watt ratio of humans is truly fascinating.",
  "Haven't tried out foundry Does it integrate well with other libraries like crew ai",
  "This is very true You become the person that achieves it before even achieving the goal",
  "Im curious about how such a system could be properly guardrailed to prevent it from accessing unintended info It seems to have so much freedom than traditional RAG",
  "Threats usually work well for me though Maybe you aren't threatening it well enough",
  "Excited to see what youll be sharing",
  "The agent that does no work being the most valuable is the insight. Orchestration without reflection just scales the drift. What keeps breaking? What did we learn? is the loop most setups are missing. Teams add doers; they don't add a critic.",
  "the one tool rarely fits every team point stuck with me. you're not just picking different tools, you're actually picking different workflows per team because their code maturity, review culture, and risk tolerance are all over the map. that's the real coordination problem.",
  "software development is still a team sport, even with AI. The tools are the easy part. The culture and the process change is where the real work is.",
  "Recently built an agentic system that helped a client who owns a solar company automatically perform dm follow-ups and also do things like load estimation, that uses computer vision to calculate what inverter and battery size is right for customers based on their appliances",
  "Deepseek OCR + Gemini, for image understanding",
  "How does this differ from what already exists?",
  "now imagine the power of a whole team",
  "Better work ethic than 99% of LinkedIn",
  "I'm a pretty big fan of UUIDv7. You get db-friendly sequential sorting while effectively isolating all collision risk to a single millisecond window.",
  "i support this message",
  "I use it for my own posts 😉",
  "Stand proud",
  "how random",
  "Congrats 🔥",
];

// ─── Message listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'GEMINI_SUGGEST') return;

  const { postText, postAuthor, refinement, currentComment, platform = 'linkedin' } = message;

  chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'personalStyle', 'enabledPlatforms', 'humilityLevel'], (result) => {
    const apiKey = result.geminiApiKey;
    const modelMode = normalizeModelMode(result.geminiModel);
    const personalStyle = (result.personalStyle && result.personalStyle.trim())
      ? result.personalStyle.trim()
      : DEFAULT_STYLE_SAMPLES.join('\n');
    const enabledPlatforms = result.enabledPlatforms || { linkedin: true, twitter: true };
    const humilityLevel = result.humilityLevel !== undefined ? result.humilityLevel : 2;

    if (enabledPlatforms[platform] === false) {
      sendResponse({ disabled: true });
      return;
    }

    if (!apiKey) {
      sendResponse({ error: 'Open NetworkMaxx settings and paste your Gemini API key to get started.' });
      return;
    }

    fetchSuggestions(postText, postAuthor, apiKey, modelMode, personalStyle, refinement, currentComment, humilityLevel)
      .then(res => {
        if (!res?.suggestions?.length) {
          sendResponse({ error: 'No suggestions generated. Please try again.' });
        } else {
          sendResponse({ suggestions: res.suggestions, debugPrompt: res.debugPrompt });
        }
      })
      .catch(e => {
        let msg = 'Failed to generate comment. Try again.';
        if (e?.message?.includes('403') || e?.message?.includes('API_KEY_INVALID')) {
          msg = 'Invalid API key. Check your NetworkMaxx settings.';
        } else if (e?.status === 429) {
          msg = 'Rate limit hit. Wait a moment and try again.';
        }
        sendResponse({ error: msg });
      });
  });

  return true; // keep channel open for async response
});

// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildPrompt(postText, postAuthor, personalStyle, refinement, currentComment, humilityLevel = 2) {
  const lines = [];

  lines.push('[POST-AUTHOR]');
  lines.push(postAuthor || 'Unknown');
  lines.push('[/POST-AUTHOR]');
  lines.push('');
  lines.push('[POST-CONTENT]');
  lines.push(postText);
  lines.push('[/POST-CONTENT]');

  if (currentComment && currentComment.trim()) {
    lines.push('');
    lines.push('[CURRENT-COMMENT]');
    lines.push(currentComment.trim());
    lines.push('[/CURRENT-COMMENT]');
  }

  if (refinement && refinement.trim()) {
    lines.push('');
    lines.push('[REFINEMENT]');
    lines.push(refinement.trim());
    lines.push('[/REFINEMENT]');
  }

  lines.push('');
  lines.push('Before writing any comment, do this silently:');
  lines.push('1. In one sentence — what SPECIFICALLY is this post saying/claiming/announcing?');
  lines.push('2. List 3 distinct things a real reader could react to (specific details, numbers, decisions, claims — not generic topics).');
  lines.push('Use those 3 angles as the basis for your 3 comment variants.');

  if (personalStyle && personalStyle.trim()) {
    lines.push('');
    lines.push('[MY-PAST-COMMENTS]');
    lines.push(personalStyle.trim());
    lines.push('[/MY-PAST-COMMENTS]');
    lines.push('');
    lines.push('Those are real comments I wrote. Match this EXACT voice:');
    lines.push('- Keep sentences short, direct, and conversational. Sometimes start with lowercase.');
    lines.push('- Avoid formal, corporate, or overly polite tone.');
    lines.push('- Casual punctuation, realistic tech/dev slang or subtle dry humor when appropriate.');
    lines.push('- Match the concise, punchy style of the examples above.');
  } else {
    lines.push('');
    lines.push('No style examples provided. Default: casual, short, direct. Write like a real dev replying in 5 seconds.');
  }

  const hVal = parseInt(humilityLevel, 10);
  if (hVal === 2) {
    lines.push('');
    lines.push('[JOB HUNTING / STRATEGIC TONE: HUMBLE EXPERT]');
    lines.push('- Demonstrate deep technical comprehension, grounded self-awareness, and genuine curiosity without boasting.');
    lines.push('- Avoid submissive fluff ("I am just a beginner"), but avoid boastful posturing. Sound like a sharp, observant peer.');
    lines.push('- Share grounded real-world nuances, trade-offs, or concrete observations that reveal true problem-solving skill.');
  } else if (hVal === 3) {
    lines.push('');
    lines.push('[JOB HUNTING / STRATEGIC TONE: WITTY BUILDER]');
    lines.push('- Combine intellectual depth with subtle, dry engineering humor or witty observations.');
    lines.push('- Acknowledge real-world software quirks (debugging pain, edge cases, legacy debt) with a sharp, relatable wit.');
    lines.push('- Keep the tone lighthearted yet smart — never forced or corny.');
  } else {
    lines.push('');
    lines.push('[STRATEGIC TONE: DIRECT & CONCISE]');
    lines.push('- Ultra-direct, minimal, and blunt. Strip out unnecessary filler.');
  }

  lines.push('');
  lines.push('Generate exactly 3 LinkedIn comment variants. Each must have a DIFFERENT structure — no two can share the same form or length category:');
  lines.push('');
  lines.push('VARIANT 1 — ULTRA SHORT: Hard cap of 12 words. One blunt observation, sharp take, or dry reaction. Strip everything non-essential.');
  lines.push('VARIANT 2 — QUESTION: One genuine, specific question about a concrete detail in the post. Not rhetorical. Not "what do you think?". A real question you would actually want answered.');
  lines.push('VARIANT 3 — PUSHBACK: Challenge a claim, flag what the post glossed over, or add context that complicates their point. If there is any foothold to disagree — take it.');



  lines.push('');
  lines.push('WHAT MAKES AI COMMENTS INSTANTLY OBVIOUS — never do any of this:');
  lines.push('- Opening with unsolicited praise: "Great post!", "Love this!", "Such an insightful share!", "This is so powerful", "What a read!"');
  lines.push('- Performative enthusiasm: "I love how you...", "This truly resonates...", "What a journey!", "So proud of you!"');
  lines.push('- Generic encouragement that fits any post ever written: "Keep going!", "You\'ve got this!", "So inspiring!"');
  lines.push('- Restating what the post said, then calling it profound or timely');
  lines.push('- Fake personal anecdotes with zero specifics: "I\'ve experienced this too and it changed everything for me"');
  lines.push('- Em dashes used for effect to manufacture thoughtfulness');
  lines.push('- Hollow closing questions: "What do you think?", "Would love your thoughts!", "Anyone else feel this way?"');
  lines.push('- AI & Corporate buzzwords: delve, tapestry, beacon, testament, realm, interplay, synergy, ecosystem, paradigm, impactful, journey, space, game-changer, authentic, intentional, unpack, foster, navigate, pivot, cornerstone, landscape, showcase, spearhead, hallmark, endeavor, vibrant, holistic, meticulous, seamless, paramount, enduring, burgeoning, profound, multifaceted, indispensable');
  lines.push('- Performative copulative avoidance: NEVER replace simple verbs ("is", "are", "has") with performative filler ("serves as", "stands as", "embodies", "represents", "marks")');
  lines.push('- Negative parallelisms: NEVER format sentences as "not just X, but Y", "not X, but Y", or "X rather than Y"');
  lines.push('- Puffery & inflated significance: NEVER claim a detail "marks a pivotal moment", "underscores the importance", "reflects broader trends", or "shapes the future"');
  lines.push('- Opening templates: "As someone who...", "In today\'s world...", "We often forget that...", "This is a reminder that..."');
  lines.push('- Any sentence that could be copy-pasted onto a completely different post');
  lines.push('');
  lines.push('WHAT REAL HUMAN COMMENTS LOOK LIKE:');
  lines.push('- They react to something SPECIFIC — a detail, a claim, a number, a decision — not the post in abstract');
  lines.push('- They are short — real people do not write essays in comment sections');
  lines.push('- They have a point of view, even if mild — agree, disagree, add context, or acknowledge something concisely');
  lines.push('- They feel typed quickly, not composed carefully');
  lines.push('- They do not explain themselves or over-justify their reaction');
  lines.push('');
  lines.push('MANDATORY SELF-CHECK: Before finalising each comment, ask — "Could someone have written this without reading the post?" If yes: reject and rewrite. "Does this sound like an AI trying to be supportive?" If yes: reject and rewrite.');
  lines.push('');
  lines.push('Match the post language exactly (French post -> French reply, Spanish -> Spanish, etc.).');
  lines.push('Never start with the author\'s name.');
  lines.push('NEVER use Markdown formatting (*italics*, **bold**, _emphasis_, `code`). LinkedIn comment boxes are plain text, so raw markdown asterisks look like AI artifacts.');
  lines.push('Each of the 3 variants must take a clearly different angle, not just rephrase the same thought.');
  lines.push('');
  lines.push('Return ONLY valid JSON, no markdown, no explanation:');
  lines.push('{"topic":"one-sentence summary of what the post specifically claims","angles":["angle1","angle2","angle3"],"suggestions":["comment1","comment2","comment3"]}');

  return lines.join('\n');
}

// ─── API call chain ───────────────────────────────────────────────────────────

async function fetchSuggestions(postText, postAuthor, apiKey, modelMode, personalStyle, refinement, currentComment, humilityLevel) {
  const models = MODEL_CHAINS[modelMode] || MODEL_CHAINS[DEFAULT_MODEL_MODE];
  let lastError;

  for (const model of models) {
    try {
      return await fetchWithRetry(postText, postAuthor, apiKey, model, personalStyle, refinement, currentComment, humilityLevel);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || model === models[models.length - 1]) throw err;
      console.warn('[NetworkMaxx] ' + model + ' failed, trying next model...');
    }
  }
  throw lastError || new Error('All models exhausted');
}

async function fetchWithRetry(postText, postAuthor, apiKey, model, personalStyle, refinement, currentComment, humilityLevel) {
  const cooldown = getCooldown(apiKey, model);
  if (cooldown > 0) {
    const err = new Error('Rate limited on ' + model + '. Retrying with fallback.');
    err.status = 429;
    err.retryNextModel = true;
    throw err;
  }

  let lastError;
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      return await callGemini(postText, postAuthor, apiKey, model, personalStyle, refinement, currentComment, humilityLevel);
    } catch (err) {
      lastError = err;
      if (!isTransient(err) || attempt === MAX_TRANSIENT_RETRIES) throw err;
      console.warn('[NetworkMaxx] Transient error on attempt ' + (attempt + 1) + ', retrying in ' + TRANSIENT_RETRY_DELAYS_MS[attempt] + 'ms');
      await delay(TRANSIENT_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

// ─── Single unified Gemini call ─────────────────────────────────────────────
// Replaced the old 2-call architecture (analyzePost → buildPrompt → generate)
// with a single prompt that returns analysis + suggestions together.
// This cuts latency roughly in half — one network round trip instead of two.

async function callGemini(postText, postAuthor, apiKey, model, personalStyle, refinement, currentComment, humilityLevel) {
  console.log('[NetworkMaxx] Generating comments with ' + model + ' (single-call)');

  const prompt = buildPrompt(postText, postAuthor, personalStyle, refinement, currentComment, humilityLevel);
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1.0,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            suggestions: { type: 'array', items: { type: 'string' } },
            topic:       { type: 'string' },
            angles:      { type: 'array', items: { type: 'string' } }
          },
          required: ['suggestions']
        }
      }
    })
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = (data && data.error && data.error.message) ? data.error.message : ('HTTP ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    if (res.status === 429) {
      setCooldown(apiKey, model);
      err.retryNextModel = true;
    }
    throw err;
  }

  const text = (data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text) || '';

  const parsed = robustParseJson(text);

  const rawSuggestions = parsed && Array.isArray(parsed.suggestions)
    ? parsed.suggestions
    : parseSuggestions(text);

  const suggestions = flattenSuggestions(rawSuggestions);

  if (suggestions.length) {
    if (parsed && parsed.topic) console.log('[NetworkMaxx] Topic:', parsed.topic);
    if (parsed && parsed.angles) console.log('[NetworkMaxx] Angles:', parsed.angles);
  }

  if (!suggestions.length) {
    const err = new Error('Empty suggestions from ' + model);
    err.retryNextModel = true;
    throw err;
  }

  console.log('[NetworkMaxx] Got ' + suggestions.length + ' suggestions from ' + model);
  return { suggestions: suggestions, debugPrompt: prompt };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function robustParseJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // Try to extract JSON from code blocks
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1].trim()); } catch (err) {}
    }
    // Try to slice from first '{' or '[' to last '}' or ']'
    const startJson = trimmed.indexOf('{');
    const startArray = trimmed.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;
    if (startJson !== -1 && (startArray === -1 || startJson < startArray)) {
      startIdx = startJson;
      endIdx = trimmed.lastIndexOf('}');
    } else if (startArray !== -1) {
      startIdx = startArray;
      endIdx = trimmed.lastIndexOf(']');
    }
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      try { return JSON.parse(trimmed.slice(startIdx, endIdx + 1).trim()); } catch (err) {}
    }
  }
  return null;
}

function stripMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  let str = text;
  // Remove markdown links [text](url) -> text
  str = str.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Remove bold & italics (*word*, **word**, ***word***, _word_, __word__, ___word___)
  str = str.replace(/(\*{1,3}|_{1,3})([^*_\n]+)\1/g, '$2');
  // Remove strikethrough ~~word~~
  str = str.replace(/~~([^~]+)~~/g, '$1');
  // Remove inline code `word`
  str = str.replace(/`([^`]+)`/g, '$1');
  // Remove leading blockquote or header symbols
  str = str.replace(/^[\s>#]+/, '');
  return str.trim();
}

function flattenSuggestions(arr) {
  let results = [];
  if (!Array.isArray(arr)) return results;
  
  for (let i = 0; i < arr.length; i++) {
    let s = String(arr[i] || '').trim();
    if (!s) continue;
    
    // Check if the string itself contains a nested JSON structure
    let cleanText = s;
    if (cleanText.toLowerCase().startsWith('suggestions:')) {
      cleanText = cleanText.replace(/^suggestions:\s*/i, '').trim();
    }
    
    if (cleanText.startsWith('{') || cleanText.startsWith('[') || cleanText.includes('"suggestions"') || cleanText.includes('variant1')) {
      const parsed = robustParseJson(cleanText);
      if (parsed) {
        if (Array.isArray(parsed)) {
          results = results.concat(flattenSuggestions(parsed));
        } else if (parsed.suggestions) {
          if (Array.isArray(parsed.suggestions)) {
            results = results.concat(flattenSuggestions(parsed.suggestions));
          } else if (typeof parsed.suggestions === 'object') {
            results = results.concat(flattenSuggestions(Object.values(parsed.suggestions)));
          }
        } else {
          results = results.concat(flattenSuggestions(Object.values(parsed)));
        }
        continue;
      }
    }
    
    // Regular string cleanup & markdown stripping
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    s = s.replace(/^["']|["']$/g, '').trim();
    s = stripMarkdown(s);
    if (s) {
      results.push(s);
    }
  }
  return results;
}

function parseSuggestions(text) {
  const parsed = robustParseJson(text);
  if (parsed) {
    return Array.isArray(parsed) ? parsed : (parsed.suggestions ? parsed.suggestions : []);
  }
  
  const cleaned = text.trim();
  if (cleaned.startsWith('{') || cleaned.startsWith('[') || cleaned.includes('"suggestions"')) {
    return [];
  }

  let fallback = cleaned;
  fallback = fallback.replace(/^(here is the json requested|here are the suggestions|json requested):/i, '').trim();
  fallback = fallback.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (fallback.startsWith('{') || fallback.startsWith('[') || fallback.includes('"suggestions"')) {
    return [];
  }
  return fallback ? [stripMarkdown(fallback)] : [];
}

function normalizeModelMode(value) {
  if (value === 'flash' || value === 'pro') return value;
  return DEFAULT_MODEL_MODE;
}

function isRetryable(err) {
  return isTransient(err) || (err && err.status === 404) || !!(err && err.retryNextModel);
}

function isTransient(err) {
  const s = err && err.status;
  return s === 500 || s === 502 || s === 503 || s === 504;
}

function getCooldown(apiKey, model) {
  const key = apiKey + ':' + model;
  const until = GEMINI_MODEL_COOLDOWNS.get(key) || 0;
  const remaining = until - Date.now();
  if (remaining <= 0) GEMINI_MODEL_COOLDOWNS.delete(key);
  return Math.max(0, remaining);
}

function setCooldown(apiKey, model) {
  GEMINI_MODEL_COOLDOWNS.set(apiKey + ':' + model, Date.now() + DEFAULT_RATE_LIMIT_COOLDOWN_MS);
}

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}
