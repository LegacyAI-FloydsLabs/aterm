import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Scrollback } from "../pty/scrollback.js";
import { distill } from "./distill.js";

// -- Realistic terminal output fixtures --

// npm install with ANSI codes, progress bars, network noise, and real content
const NPM_OUTPUT = [
  "\x1b[32mnpm\x1b[39m \x1b[32mwarn\x1b[39m deprecated inflight@1.0.6",
  "⸩ ░░░░░░░░░░░░░░░░░░ idealTree:lib: sill idealTree",
  "⸩ ░░░░░░░░░░░░░░░░░░ idealTree:lib: sill idealTree buildDeps",
  "⸩ ░░░░░░░░░░░░░░░░░░ idealTree:lib: sill idealTree",
  "",
  "added 137 packages, and audited 138 packages in 4s",
  "",
  "15 packages are looking for funding",
  "  run `npm fund` for details",
  "",
  "found 0 vulnerabilities",
].join("\n");

// Realistic npm install with network requests and timing
const NPM_REAL = [
  "npm http fetch GET 200 https://registry.npmjs.org/react 450ms (cache miss)",
  "npm http fetch GET 200 https://registry.npmjs.org/lodash 230ms (cache miss)",
  "npm http fetch GET 200 https://registry.npmjs.org/typescript 680ms (cache miss)",
  "npm timing reify:loadBundles Completed in 0ms",
  "npm timing reifyNode:node_modules/react Completed in 120ms",
  "npm timing reifyNode:node_modules/lodash Completed in 80ms",
  "npm timing reifyNode:node_modules/typescript Completed in 200ms",
  "",
  "added 3 packages in 2s",
  "",
  "found 0 vulnerabilities",
].join("\n");

// Cargo build with compilation noise and errors
const CARGO_OUTPUT = [
  "user@host:~/project$ cargo build",
  "   Compiling mylib v0.1.0 (/home/user/project)",
  "   Compiling mylib v0.1.0 (/home/user/project)",
  "   Compiling mylib v0.1.0 (/home/user/project)",
  "   Compiling mylib v0.1.0 (/home/user/project)",
  "error[E0308]: mismatched types",
  "  --> src/lib.rs:42:5",
  "   |",
  "42 |     let x: String = get_name();",
  "   |                     ^^^^^^^^^^ expected `String`, found `&str`",
  "   |",
  "error: could not compile `mylib` (lib) due to 1 previous error",
  "user@host:~/project$ ",
].join("\n");

// Bash startup banner (SSH login style)
const BASH_STARTUP = [
  "Last login: Mon May 12 08:30:42 2026 from 192.168.1.100",
  "Linux devbox 6.1.0-25-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.106-3 (2024-10-28) x86_64",
  "",
  "The programs included with the Debian GNU/Linux system are free software;",
  "the exact distribution terms for each program are described in the",
  "individual files in /usr/share/doc/*/copyright.",
  "",
  "You have new mail.",
  "user@devbox:~$ ",
].join("\n");

// Docker build output
const DOCKER_BUILD = [
  "[1/4] FROM docker.io/library/node:20-alpine@sha256:abc123",
  "[2/4] WORKDIR /app",
  "[3/4] RUN npm ci --only=production",
  "[4/4] COPY . .",
  "=> [1/4] FROM docker.io/library/node:20-alpine@sha256:abc123",
  "=> => sha256:abc123def456 5.12MB / 45.23MB [======>                     ] 11%",
  "=> => sha256:def456abc789 3.01MB / 3.01MB",
  "=> [2/4] WORKDIR /app",
  "=> [3/4] RUN npm ci --only=production",
  "=> => # npm warn deprecated inflight@1.0.6",
  "=> => # added 245 packages in 12s",
  "=> [4/4] COPY . .",
  "=> exporting to image",
  "=> => naming to docker.io/library/myapp:latest",
].join("\n");

// Repeated lines (compilation spam)
const REPEATED_LINES = [
  "Building module: auth (1/50)",
  "Building module: auth (2/50)",
  "Building module: auth (3/50)",
  "Building module: auth (4/50)",
  "Building module: auth (5/50)",
  "  Compiling auth/src/login.ts",
  "  Compiling auth/src/login.ts",
  "  Compiling auth/src/login.ts",
  "  Compiling auth/src/login.ts",
  "  Compiling auth/src/login.ts",
  "",
  "Build completed successfully.",
  "  Duration: 4.2s",
].join("\n");

function makeScrollback(content: string): Scrollback {
  const sb = new Scrollback();
  sb.append(content);
  return sb;
}

describe("Output Distillation", () => {
  describe("mode: raw", () => {
    it("returns content unchanged", () => {
      const sb = makeScrollback(NPM_OUTPUT);
      const result = distill(sb, "raw");
      assert.equal(result.content, NPM_OUTPUT);
      assert.equal(result.reductionPct, 0);
    });
  });

  describe("mode: clean", () => {
    it("strips ANSI escape codes", () => {
      const sb = makeScrollback(NPM_OUTPUT);
      const result = distill(sb, "clean");
      assert.ok(!result.content.includes("\x1b["), "should not contain ANSI CSI");
      assert.ok(result.content.includes("npm warn deprecated"), "should preserve text content");
    });

    it("deduplicates multiple blank lines", () => {
      const sb = makeScrollback("line1\n\n\n\nline2\n\n\n\n");
      const result = distill(sb, "clean");
      const lines = result.content.split("\n");
      assert.equal(lines.length, 3, `should have 3 lines (line1, blank, line2), got ${lines.length}`);
      assert.equal(lines[0], "line1");
      assert.equal(lines[1], "");
      assert.equal(lines[2], "line2");
    });

    it("trims leading and trailing blank lines", () => {
      const sb = makeScrollback("\n\n\nhello\n\n\n");
      const result = distill(sb, "clean");
      assert.equal(result.content, "hello");
    });
  });

  describe("mode: summary", () => {
    it("removes progress bars and noise", () => {
      const sb = makeScrollback(NPM_OUTPUT);
      const result = distill(sb, "summary");
      assert.ok(!result.content.includes("idealTree"), "should remove progress noise");
      assert.ok(result.content.includes("added 137 packages"), "should keep result");
      assert.ok(result.content.includes("found 0 vulnerabilities"), "should keep final status");
    });

    it("removes npm network noise", () => {
      const sb = makeScrollback(NPM_REAL);
      const result = distill(sb, "summary");
      assert.ok(!result.content.includes("npm http fetch"), "should remove npm http lines");
      assert.ok(!result.content.includes("npm timing"), "should remove npm timing lines");
      assert.ok(result.content.includes("added 3 packages"), "should keep result");
      assert.ok(result.content.includes("found 0 vulnerabilities"), "should keep final status");
    });

    it("keeps error lines", () => {
      const sb = makeScrollback(CARGO_OUTPUT);
      const result = distill(sb, "summary");
      assert.ok(result.content.includes("error[E0308]"), "should keep error code");
      assert.ok(result.content.includes("mismatched types"), "should keep error detail");
    });

    it("deduplicates consecutive identical lines", () => {
      const sb = makeScrollback(REPEATED_LINES);
      const result = distill(sb, "summary");
      // "Compiling auth/src/login.ts" appears 5 times in input, should appear once
      const compileCount = (result.content.match(/Compiling auth\/src\/login\.ts/g) || []).length;
      assert.equal(compileCount, 1, `should dedup to 1, got ${compileCount}`);
      assert.ok(result.content.includes("Build completed successfully"), "should keep final result");
    });

    it("filters cargo compilation noise", () => {
      const sb = makeScrollback(CARGO_OUTPUT);
      const result = distill(sb, "summary");
      assert.ok(!result.content.includes("Compiling mylib"), "should remove cargo compilation lines");
    });

    it("filters bash startup noise", () => {
      const sb = makeScrollback(BASH_STARTUP);
      const result = distill(sb, "summary");
      assert.ok(!result.content.includes("Last login:"), "should remove login banner");
      assert.ok(!result.content.includes("Linux devbox"), "should remove OS version");
    });

    it("filters docker build noise", () => {
      const sb = makeScrollback(DOCKER_BUILD);
      const result = distill(sb, "summary");
      assert.ok(!result.content.includes("[1/4]"), "should remove build steps");
      assert.ok(!result.content.includes("=>"), "should remove docker prefixes");
      assert.ok(!result.content.includes("sha256:"), "should remove layer SHAs");
    });

    it("achieves >=50% reduction on noisy npm output", () => {
      const sb = makeScrollback(NPM_REAL);
      const result = distill(sb, "summary");
      assert.ok(result.reductionPct >= 50, `reduction should be >=50%, got ${result.reductionPct}%`);
    });

    it("respects maxLines", () => {
      const sb = makeScrollback(CARGO_OUTPUT);
      const result = distill(sb, "summary", { maxLines: 3 });
      const lines = result.content.split("\n").filter((l) => l.trim());
      assert.ok(lines.length <= 3, `should have <=3 non-empty lines, got ${lines.length}`);
    });
  });

  describe("mode: structured", () => {
    it("parses cargo output into typed segments", () => {
      const sb = makeScrollback(CARGO_OUTPUT);
      const result = distill(sb, "structured");
      assert.ok(result.segments, "should have segments");
      assert.ok(result.segments!.length >= 2, `should have >=2 segments, got ${result.segments!.length}`);

      const types = result.segments!.map((s) => s.type);
      assert.ok(types.includes("command"), "should have a command segment");
      assert.ok(types.includes("error"), "should have an error segment");
    });

    it("separates command from output", () => {
      const sb = makeScrollback(CARGO_OUTPUT);
      const result = distill(sb, "structured");
      const cmd = result.segments!.find((s) => s.type === "command");
      assert.ok(cmd, "should find command segment");
      assert.ok(cmd!.text.includes("cargo build"), "command should be cargo build");
    });

    it("does NOT include type tags in content", () => {
      const sb = makeScrollback(CARGO_OUTPUT);
      const result = distill(sb, "structured");
      assert.ok(!result.content.includes("[command]"), "content should not contain [command] tag");
      assert.ok(!result.content.includes("[error]"), "content should not contain [error] tag");
      assert.ok(!result.content.includes("[output]"), "content should not contain [output] tag");
      assert.ok(!result.content.includes("---"), "content should not contain segment separators");
    });

    it("content is reduced compared to raw", () => {
      const sb = makeScrollback(CARGO_OUTPUT);
      const result = distill(sb, "structured");
      assert.ok(result.reductionPct > 0, "structured should reduce output size");
      // Content should be smaller than raw (no [type] tags adding overhead)
      assert.ok(result.content.length <= result.originalBytes,
        `structured content (${result.content.length}) should not exceed raw (${result.originalBytes})`);
    });
  });

  describe("mode: delta", () => {
    it("returns only new content since last read", () => {
      const sb = makeScrollback("first output\n");
      const d1 = distill(sb, "delta", { consumerId: "agent-1" });
      assert.ok(d1.content.includes("first output"));

      sb.append("second output\n");
      const d2 = distill(sb, "delta", { consumerId: "agent-1" });
      assert.ok(d2.content.includes("second output"), "should have new content");
      assert.ok(!d2.content.includes("first output"), "should NOT have old content");
    });

    it("strips ANSI from delta output", () => {
      const sb = makeScrollback("\x1b[31mred\x1b[0m\n");
      const d = distill(sb, "delta", { consumerId: "agent-2" });
      assert.ok(!d.content.includes("\x1b["), "delta should strip ANSI");
      assert.ok(d.content.includes("red"));
    });
  });
});
