import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { getConfig } from "./lib/config";
import { HttpError } from "./lib/http-errors";
let active: ChildProcess | undefined;
export async function stopImageWorker() {
  const child = active;
  if (child && child.exitCode === null && child.signalCode === null)
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGKILL");
    });
}
export async function transformImage(
  content: Buffer,
  signal?: AbortSignal,
): Promise<{ content: Buffer; width: number; height: number }> {
  const limits = getConfig().images;
  const child = fork(path.resolve(__dirname, "workers/image.worker.cjs"), [], {
    execArgv: [],
    serialization: "advanced",
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  active = child;
  try {
    return await new Promise((resolve, reject) => {
      const fail = (code = "IMAGE_PROCESSING_INTERRUPTED") =>
        reject(new HttpError(503, "Image processing interrupted.", { code }));
      const abort = () => fail();
      const timer = setTimeout(() => fail(), limits.transformMs);
      signal?.addEventListener("abort", abort, { once: true });
      const clear = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      child.once("exit", () => {
        clear();
        fail();
      });
      child.once("error", () => {
        clear();
        fail();
      });
      child.once(
        "message",
        (message: {
          error?: string;
          status?: number;
          content: Buffer;
          width: number;
          height: number;
        }) => {
          clear();
          if (message.error)
            reject(
              new HttpError(message.status ?? 400, "Invalid image.", {
                code: message.error,
              }),
            );
          else resolve({ ...message, content: Buffer.from(message.content) });
        },
      );
      if (signal?.aborted) return fail();
      child.send({ content, limits }, (error) => {
        if (error) {
          clear();
          fail();
        }
      });
    });
  } finally {
    await stopImageWorker();
    if (active === child) active = undefined;
  }
}
