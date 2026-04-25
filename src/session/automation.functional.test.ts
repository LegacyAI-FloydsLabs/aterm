import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  makeTempDir,
  startAtermServer,
  waitFor,
} from "../test/functional-harness.js";

describe("Known lib-only claim — cron automation must be wired into the running server", { timeout: 15_000 }, () => {
  it("fires a configured cron session from aterm.yml without manually starting the session", async () => {
    const cwd = makeTempDir("aterm-cron-functional-");
    const fireFileName = "cron-fired.txt";
    const configText = `
sessions:
  - name: cron-functional
    command: bash -lc "date +%s >> ${fireFileName}"
    directory: ${cwd}
    automation: {type: cron, cronExpression: "*/1 * * * *"}
`;

    const server = await startAtermServer({ cwd, configText });
    try {
      const configPath = path.join(server.cwd, "aterm.yml");
      const actualConfig = readFileSync(configPath, "utf8");
      assert.match(actualConfig, /automation: \{type: cron, cronExpression: "\*\/1 \* \* \* \*"\}/);

      const firePath = path.join(server.cwd, fireFileName);
      await waitFor(() => existsSync(firePath) && readFileSync(firePath, "utf8").trim().length > 0, {
        timeoutMs: 8_000,
        intervalMs: 1_000,
        description: "configured cron automation to fire command in running server",
      });

      const fired = readFileSync(firePath, "utf8").trim().split("\n").filter(Boolean);
      assert.ok(fired.length >= 1, "cron automation should append at least one timestamp");
    } finally {
      await server.dispose();
    }
  });
});
