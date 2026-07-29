import { spawn } from "node:child_process";

export class PythonScriptError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "PythonScriptError";
  }
}

/**
 * Runs `python3 <scriptPath> <args...>` and parses its stdout as JSON.
 * The script contract (see scripts/lead_pipeline.py) is: print a JSON report
 * to stdout and exit 0 on success; on failure, print `{error, detail}` JSON
 * to stderr and exit non-zero.
 */
export function runPythonJson<T = unknown>(scriptPath: string, args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath, ...args], { cwd: process.cwd() });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    proc.on("error", (err) => {
      reject(new PythonScriptError(`Failed to spawn python3: ${err.message}`, stderr));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        let detail = stderr.trim();
        try {
          const parsed = JSON.parse(stderr);
          detail = parsed.detail ?? parsed.error ?? stderr;
        } catch {
          // stderr wasn't JSON; use raw text
        }
        reject(new PythonScriptError(`python3 ${scriptPath} exited with code ${code}: ${detail}`, stderr));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (err) {
        reject(new PythonScriptError(`Failed to parse python3 stdout as JSON: ${(err as Error).message}`, stderr));
      }
    });
  });
}
