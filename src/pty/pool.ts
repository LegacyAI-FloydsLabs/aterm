/**
 * PTY Pool — manages spawning, lifecycle, and I/O for terminal processes.
 *
 * Each PTY has:
 * - A scrollback ring buffer
 * - Event-driven output (not polling)
 * - Crash recovery with configurable backoff
 * - Resize support
 * - Command tracking (what was sent, when)
 */
import * as pty from "node-pty";
import { EventEmitter } from "node:events";
import { Scrollback } from "./scrollback.js";

export interface PtyOptions {
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  scrollbackBytes?: number;
}

export interface RestartPolicy {
  maxRetries: number;
  windowSeconds: number;
}

export interface PtyInstance {
  id: string;
  process: pty.IPty | null;
  scrollback: Scrollback;
  pid: number | null;
  running: boolean;
  exitCode: number | null;
  options: PtyOptions;
  restartPolicy: RestartPolicy;

  // Command tracking — critical for Output Intelligence
  lastCommandSentAt: number | null;
  lastCommandText: string | null;
  lastOutputAt: number | null;
  commandHistory: string[];

  // Restart tracking
  restartCount: number;
  restartTimestamps: number[];
  startedAt: number | null;
}

const DEFAULT_RESTART: RestartPolicy = { maxRetries: 3, windowSeconds: 300 };
const MAX_HISTORY = 100;

export class PtyPool extends EventEmitter {
  private instances = new Map<string, PtyInstance>();

  /** Spawn a new PTY. Returns the instance. */
  spawn(id: string, opts: PtyOptions, restartPolicy?: RestartPolicy): PtyInstance {
    if (this.instances.has(id)) {
      throw new Error(`PTY ${id} already exists`);
    }

    const instance: PtyInstance = {
      id,
      process: null,
      scrollback: new Scrollback(opts.scrollbackBytes ?? 256 * 1024),
      pid: null,
      running: false,
      exitCode: null,
      options: opts,
      restartPolicy: restartPolicy ?? DEFAULT_RESTART,
      lastCommandSentAt: null,
      lastCommandText: null,
      lastOutputAt: null,
      commandHistory: [],
      restartCount: 0,
      restartTimestamps: [],
      startedAt: null,
    };

    this.instances.set(id, instance);
    this._startProcess(instance);
    return instance;
  }

  /** Start (or restart) the underlying PTY process */
  private _startProcess(inst: PtyInstance): void {
    const { command, args, cwd, env, cols, rows } = inst.options;

    // Parse command into binary + args if no explicit args
    let binary: string;
    let spawnArgs: string[];
    if (args && args.length > 0) {
      binary = command;
      spawnArgs = args;
    } else {
      const parts = command.split(/\s+/);
      binary = parts[0]!;
      spawnArgs = parts.slice(1);
    }

    // Resolve shell path for common names
    const shellPaths: Record<string, string> = {
      bash: "/bin/bash",
      zsh: "/bin/zsh",
      sh: "/bin/sh",
      fish: "/usr/local/bin/fish",
    };
    if (shellPaths[binary]) binary = shellPaths[binary]!;

    const mergedEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      TERM: "xterm-256color",
      ...env,
    };

    try {
      const proc = pty.spawn(binary, spawnArgs, {
        name: "xterm-256color",
        cols: cols ?? 120,
        rows: rows ?? 40,
        cwd,
        env: mergedEnv,
      });

      inst.process = proc;
      inst.pid = proc.pid;
      inst.running = true;
      inst.exitCode = null;
      inst.startedAt = Date.now();

      proc.onData((data: string) => {
        inst.scrollback.append(data);
        inst.lastOutputAt = Date.now();
        this.emit("data", inst.id, data);
      });

      proc.onExit(({ exitCode, signal }) => {
        inst.running = false;
        inst.exitCode = exitCode;
        inst.pid = null;
        inst.process = null;
        this.emit("exit", inst.id, exitCode, signal);
        this._maybeRestart(inst);
      });

      this.emit("spawn", inst.id, proc.pid);
    } catch (err) {
      inst.running = false;
      inst.process = null;
      this.emit("error", inst.id, err);
    }
  }

  /** Auto-restart with backoff policy */
  private _maybeRestart(inst: PtyInstance): void {
    const { maxRetries, windowSeconds } = inst.restartPolicy;
    if (maxRetries <= 0) return;

    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    // Prune old timestamps outside window
    inst.restartTimestamps = inst.restartTimestamps.filter(
      (t) => now - t < windowMs
    );

    if (inst.restartTimestamps.length >= maxRetries) {
      this.emit("restart-exhausted", inst.id, inst.restartCount);
      return;
    }

    inst.restartTimestamps.push(now);
    inst.restartCount++;

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, inst.restartTimestamps.length - 1), 30000);
    setTimeout(() => {
      if (!inst.running && this.instances.has(inst.id)) {
        this._startProcess(inst);
      }
    }, delay);
  }

  /** Send input to a PTY. Tracks the command for Output Intelligence. */
  write(id: string, data: string): void {
    const inst = this.instances.get(id);
    if (!inst?.process) throw new Error(`PTY ${id} not running`);

    inst.process.write(data);

    // Track command (strip trailing \r\n for history)
    const cleaned = data.replace(/[\r\n]+$/, "").trim();
    if (cleaned.length > 0) {
      inst.lastCommandSentAt = Date.now();
      inst.lastCommandText = cleaned;
      inst.commandHistory.push(cleaned);
      if (inst.commandHistory.length > MAX_HISTORY) {
        inst.commandHistory.shift();
      }
    }
  }

  /** Resize a PTY */
  resize(id: string, cols: number, rows: number): void {
    const inst = this.instances.get(id);
    if (!inst?.process) return;
    inst.process.resize(cols, rows);
    inst.options.cols = cols;
    inst.options.rows = rows;
  }

  /** Kill a PTY (no auto-restart) */
  kill(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    // Disable restart
    inst.restartPolicy = { maxRetries: 0, windowSeconds: 0 };
    inst.process?.kill();
  }

  /** Remove a PTY entirely */
  remove(id: string): void {
    this.kill(id);
    this.instances.delete(id);
  }

  /** Get a PTY instance by ID */
  get(id: string): PtyInstance | undefined {
    return this.instances.get(id);
  }

  /** List all PTY IDs */
  ids(): string[] {
    return [...this.instances.keys()];
  }

  /** Destroy all PTYs */
  destroyAll(): void {
    for (const id of this.ids()) {
      this.remove(id);
    }
  }
}
