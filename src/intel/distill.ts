/**
 * Output Distillation — 5 modes for terminal output delivery.
 *
 * The core of the token economy: agents don't need 500 lines of npm install
 * output. They need 5 lines of signal.
 *
 * Modes:
 *   raw       — pass-through (0% reduction)
 *   clean     — ANSI stripped, \r-overwrites collapsed (~30% reduction)
 *   summary   — noise removed, signal only (~75% reduction)
 *   structured — typed segments, content aggressively truncated (~85% reduction)
 *   delta     — only new content since consumer's last read (variable)
 *
 * Pipeline: raw → collapse \r overwrites → strip ANSI → mode-specific filter
 */

import { Scrollback } from "../pty/scrollback.js";
import { stripAnsi } from "./ansi.js";

export type DistillMode = "raw" | "clean" | "summary" | "structured" | "delta";

export interface StructuredSegment {
  type: "command" | "output" | "error" | "prompt" | "progress";
  text: string;
  lines: number;
}

export interface DistilledOutput {
  mode: DistillMode;
  content: string;
  segments?: StructuredSegment[];
  originalBytes: number;
  distilledBytes: number;
  reductionPct: number;
}

// ---------------------------------------------------------------------------
// Preprocessing: \r-overwrite collapsing
//
// PTY output uses \r (carriage return) to overwrite the current line for
// progress bars, spinners, and status updates. After ANSI stripping, these
// overwrites concatenate into garbage like:
//   "Progress: 10%Progress: 50%Progress: 100%"
// Collapsing them keeps only the final state of each line.
// ---------------------------------------------------------------------------

function collapseCarriageReturns(raw: string): string {
  // Step 1: Normalize \r\n → \n (CRLF is standard line ending, not overwrite)
  const normalized = raw.replace(/\r\n/g, "\n");

  // Step 2: For each line, keep only the last \r-delimited segment
  const lines = normalized.split("\n");
  const collapsed = lines.map((line) => {
    if (!line.includes("\r")) return line;
    const parts = line.split("\r");
    return parts[parts.length - 1];
  });

  return collapsed.join("\n");
}

/** Preprocess raw PTY output: collapse \r-overwrites then strip ANSI */
/** Preprocess raw PTY output: collapse \r-overwrites, strip ANSI, dedup blanks */
function preprocess(raw: string): string {
  const collapsed = collapseCarriageReturns(raw);
  const cleaned = stripAnsi(collapsed);
  // Collapse 3+ consecutive blank lines to 2 (preserve paragraph breaks)
  return cleaned.replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------------------
// Noise patterns — lines that carry no signal for agents
// ---------------------------------------------------------------------------

const NOISE_PATTERNS: RegExp[] = [
  // -- Progress bars and spinners --
  /^[\s]*[\u2800-\u28FF⸩⸨|\\\/-]/, // Braille spinners, parens spinners
  /[░▒▓█▏▎▍▌▋▊▉]{3,}/, // Block-char progress bars (3+ consecutive)
  /^\s*[\-=]{5,}[>|]/, // ASCII progress bars like [=====>   ]
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/, // Braille spinner frames

  // -- npm/yarn/pnpm --
  /^[\s]*\d+\.\d+s[\s]*$/, // Timing lines
  /^\s*npm (?:http |notice |timing |verb )/, // npm network/info/verbose
  /^\s*npm (?:ERR! |WARN )/, // Keep only errors/warnings (handled by signal)
  /^\s*(?:yarn|pnpm)\s.*(?:Resolving|Fetching|Linking)/, // yarn/pnpm progress
  /^\s*\d+ packages are looking for funding/, // npm funding noise
  /^\s*run `npm fund` for details/, // npm fund suggestion
  /^\s*To address (?:all )?issues(?:, run| that do not)/, // npm audit preamble
  /^\s*Run `npm audit` for details/, // npm audit footer
  /^\s*(?:changed|audited) \d+ packages?/, // npm audit/changed summary

  // -- pip --
  /^\s*(?:Downloading|Collecting|Requirement|Installing|Successfully)\s.*\.(?:whl|tar\.gz)/,
  /^\s*Using cached\s/,

  // -- cargo/rust --
  /^\s*Downloaded \d+ crate/,
  /^\s*(?:Downloading|Compiling|Checking)\s+\S+\s+v[\d.]+/,

  // -- go --
  /^\s*(?:go: downloading|go: finding|go: extracting)/,

  // -- Docker --
  /^\s*\[[\d\/]+\]\s/, // Docker build steps [1/4]
  /^\s*=>\s/, // Docker build output prefix
  /^\s*[0-9a-f]{12}\s/, // Docker layer IDs
  /^\s*=> => (?:sha256|writing|naming|exporting)/, // Docker sub-steps

  // -- apt/pacman/brew --
  /^\s*(?:Get:|Hit:|Ign:)\d+\s/, // apt package fetch
  /^\s*(?:Reading package lists|Building dependency tree|Reading state information)/,
  /^\s*==>\s(?:Downloading|Pouring|Installing|Patching)/,

  // -- Git --
  /^remote: (?:Counting|Compressing|Receiving|Resolving|Total|Enumerating)/,
  /^\s*(?:Cloning into|Resolving deltas|Updating files|Checking connectivity|Checking out files|Filtering content)/,

  // -- Webpack/bundler/vite --
  /^[\s]*\d+%[\s]+/, // Percentage progress
  /^\s*\[[\d]+\/[\d]+\]\s/, // Step counters [1/4], [12/50]

  // -- Build tool compilation lines --
  /^\s*(?:Built|Building|Bundling|Optimizing|Minifying|Transpiling|Generating)/,

  // -- Bash startup / shell noise --
  /^\s*Last login:\s/,
  /^\s*Welcome to\s/,
  /^\s*(?:Linux|Darwin|SunOS)\s/,
  /^\s*System (?:information|load|uptime)/,
  /^The programs included with the/,
  /^the exact distribution terms/,
  /^individual files in \/usr/,
  /^\s*You have (?:new |no )mail/,

  // -- Shell config noise --
  /^\s*source ~?\//,
  /^\s*exec (?:bash|zsh|sh|fish)/,

  // -- Repeated blank lines (keep 1) --
  /^[\s]*$/,
];

// ---------------------------------------------------------------------------
// Error indicators — lines that are ALWAYS signal (override noise)
// ---------------------------------------------------------------------------

const ERROR_INDICATORS: RegExp[] = [
  /error/i,
  /Error/,
  /^FAIL/,
  /^FATAL/i,
  /warning:/i,
  /Warning:/,
  /^\s*(?:npm|pnpm|yarn)\s+warn\b/i, // npm/yarn/pnpm warnings
  /^\s*warn\b.*deprecated/i, // deprecation warnings
  /panic/i,
  /traceback/i,
  /exception/i,
  /segfault/i,
  /^TypeError:/,
  /^ReferenceError:/,
  /^SyntaxError:/,
  /^RangeError:/,
  /^(?:npm|pnpm|yarn)\s+ERR[! ]/,
  /^\s*E\d{4}:/,
  /^\s*at\s+/,
  /^\s*-->/,
  /^\s*\^/,
  /^\s*command not found/i,
  /^\s*permission denied/i,
  /^\s*cannot .*: no such file/i,
  /^\s*(?:fatal|Fatal)\s*:/,
  /^\s*\[ERROR\]/,
  /^\s*\[FATAL\]/,
  /^\s*\[WARN\]/,
];

// -- Result indicators — lines that should survive even if they look like noise --
const RESULT_INDICATORS: RegExp[] = [
  /^\s*(?:added|removed|updated|installed) \d+ packages?/i,
  /^\s*Build (?:completed|succeeded|finished)/i,
  /^\s*Successfully /i,
  /^\s*Done in \d/i,
  /^\s*passed.*\dfailed/i,
  /^\s*tests? \d+ (?:passed|failed)/i,
  /^\s*coverage:?\s*\d+/i,
  /^\s*✨\s*Done/i,
  /^\s*OK\b/i,
];

// ---------------------------------------------------------------------------
// Distillation functions
// ---------------------------------------------------------------------------

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(line));
}

function isSignal(line: string): boolean {
  return ERROR_INDICATORS.some((p) => p.test(line));
}

function isResult(line: string): boolean {
  return RESULT_INDICATORS.some((p) => p.test(line));
}

/** Mode: clean — collapse \r-overwrites, strip ANSI, dedup blanks, trim edges */
function distillClean(raw: string): string {
  const text = preprocess(raw);
  const lines = text.split("\n");
  const out: string[] = [];
  let lastWasBlank = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === "") {
      if (!lastWasBlank) { out.push(""); lastWasBlank = true; }
    } else {
      out.push(trimmed);
      lastWasBlank = false;
    }
  }

  while (out.length > 0 && out[0] === "") out.shift();
  while (out.length > 0 && out[out.length - 1] === "") out.pop();

  return out.join("\n");
}

/**
 * Mode: summary — remove noise, keep signal+results, dedup consecutive
 * identical lines. Head+tail truncation above maxLines.
 */
function distillSummary(raw: string, maxLines = 50): string {
  const text = preprocess(raw);
  const lines = text.split("\n");
  const kept: string[] = [];
  let lastWasBlank = false;
  let lastNonBlank = "";

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Always keep signal lines (errors, warnings)
    if (isSignal(trimmed)) {
      kept.push(trimmed);
      lastWasBlank = false;
      lastNonBlank = trimmed;
      continue;
    }

    // Always keep result lines (build succeeded, tests passed, etc.)
    if (isResult(trimmed)) {
      kept.push(trimmed);
      lastWasBlank = false;
      lastNonBlank = trimmed;
      continue;
    }

    // Skip noise
    if (isNoise(trimmed)) continue;

    // Dedup blank lines
    if (trimmed === "") {
      if (!lastWasBlank) { kept.push(""); lastWasBlank = true; }
      continue;
    }

    // Dedup consecutive identical non-blank lines
    if (trimmed === lastNonBlank) continue;

    kept.push(trimmed);
    lastWasBlank = false;
    lastNonBlank = trimmed;
  }

  while (kept.length > 0 && kept[0] === "") kept.shift();
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();

  if (kept.length <= maxLines) return kept.join("\n");

  // Head+tail: first 15% context, last 85% recency
  const headCount = Math.floor(maxLines * 0.15);
  const tailCount = maxLines - headCount;
  return [...kept.slice(0, headCount), ...kept.slice(-tailCount)].join("\n");
}

// ---------------------------------------------------------------------------
// Structured distillation
// ---------------------------------------------------------------------------

const PROMPT_LINE_RE = /^(?:[^$#❯➜λ→]*[$#❯➜λ→]\s|>>>\s|In \[\d+\]:\s)/;
const ERROR_LINE_RE = /(?:error|Error|ERROR|FAIL|FATAL|traceback|panic|exception)/i;

interface StructuredResult {
  segments: StructuredSegment[];
  content: string;
}

function distillStructured(raw: string): StructuredResult {
  const text = preprocess(raw);
  const lines = text.split("\n");
  const segments: StructuredSegment[] = [];
  let current: StructuredSegment | null = null;

  function pushCurrent() {
    if (!current) return;
    current.text = current.text.trim();
    segments.push(current);
    current = null;
  }

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Skip noise and blank lines (but never signal-bearing lines)
    if (trimmed === "" || (isNoise(trimmed) && !isSignal(trimmed))) continue;

    if (PROMPT_LINE_RE.test(trimmed) && trimmed.length < 200) {
      pushCurrent();
      const afterPrompt = trimmed.replace(PROMPT_LINE_RE, "").trim();
      if (afterPrompt.length > 0) {
        current = { type: "command", text: afterPrompt, lines: 1 };
      } else {
        current = { type: "prompt", text: trimmed, lines: 1 };
      }
    } else if (current) {
      // Prompt followed by text → that text is the command being typed
      if (current.type === "prompt") {
        pushCurrent();
        current = { type: "command", text: trimmed, lines: 1 };
      } else if (current.type === "command" && current.lines === 1) {
        pushCurrent();
        current = { type: isSignal(trimmed) ? "error" : "output", text: trimmed, lines: 1 };
      } else {
        if (current.type === "output" && isSignal(trimmed)) {
          pushCurrent();
          current = { type: "error", text: trimmed, lines: 1 };
        } else {
          current.text += "\n" + trimmed;
          current.lines++;
        }
      }
    } else if (trimmed !== "") {
      current = { type: isSignal(trimmed) ? "error" : "output", text: trimmed, lines: 1 };
    }
  }
  pushCurrent();

  // Build minimal content: commands + errors + truncated output
  const contentParts: string[] = [];
  for (const seg of segments) {
    switch (seg.type) {
      case "command":
        contentParts.push(seg.text);
        break;
      case "error":
        contentParts.push(seg.text);
        break;
      case "output": {
        const segLines = seg.text.split("\n");
        // If segment contains signal lines, keep it fully (truncation would lose them)
        const hasSignal = segLines.some(l => isSignal(l));
        if (segLines.length <= 6 || hasSignal) {
          contentParts.push(seg.text);
        } else {
          const head = segLines.slice(0, 3);
          const tail = segLines.slice(-3);
          contentParts.push([...head, `[...${segLines.length - 6} lines...]`, ...tail].join("\n"));
        }
        break;
      }
      case "prompt":
      case "progress":
        // Omit from content entirely
        break;
    }
  }

  return { segments, content: contentParts.join("\n") };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function distill(
  scrollback: Scrollback,
  mode: DistillMode,
  options: {
    consumerId?: string;
    maxLines?: number;
  } = {},
): DistilledOutput {
  const raw = mode === "delta" && options.consumerId
    ? scrollback.delta(options.consumerId)
    : scrollback.raw();

  const originalBytes = raw.length;
  let content: string;
  let segments: StructuredSegment[] | undefined;

  switch (mode) {
    case "raw":
      content = raw;
      break;
    case "clean":
      content = distillClean(raw);
      break;
    case "summary":
      content = distillSummary(raw, options.maxLines ?? 50);
      break;
    case "structured": {
      const result = distillStructured(raw);
      segments = result.segments;
      content = result.content;
      break;
    }
    case "delta":
      content = preprocess(raw);
      break;
    default:
      content = raw;
  }

  const distilledBytes = content.length;
  const reductionPct = originalBytes > 0
    ? Math.round((1 - distilledBytes / originalBytes) * 100)
    : 0;

  return {
    mode,
    content,
    segments,
    originalBytes,
    distilledBytes,
    reductionPct,
  };
}
