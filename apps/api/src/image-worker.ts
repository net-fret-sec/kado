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
      let settled = false;
      const clear = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        child.off("message", onMessage);
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        clear();
        reject(
          new HttpError(503, "Image processing interrupted.", {
            code: "IMAGE_PROCESSING_INTERRUPTED",
          }),
        );
      };
      const abort = () => fail();
      const onMessage = (message: unknown) => {
        // Node --watch also uses this IPC channel for dependency notifications.
        // Only a tagged conversion result can complete the request or its deadline.
        if (
          !message ||
          typeof message !== "object" ||
          !("type" in message) ||
          message.type !== "kado:image:result"
        )
          return;
        const result = message as Record<string, unknown>;
        if ("error" in result) {
          const statuses: Record<string, number> = {
            IMAGE_INVALID_FILE: 400,
            IMAGE_FORMAT_UNSUPPORTED: 415,
            IMAGE_TOO_LARGE: 413,
          };
          if (
            typeof result.error !== "string" ||
            !Object.hasOwn(statuses, result.error) ||
            result.status !== statuses[result.error]
          )
            return fail();
          settled = true;
          clear();
          reject(
            new HttpError(result.status as number, "Invalid image.", {
              code: result.error,
            }),
          );
          return;
        }
        if (
          !Buffer.isBuffer(result.content) ||
          !result.content.length ||
          result.content.length > limits.outputBytes ||
          typeof result.width !== "number" ||
          !Number.isSafeInteger(result.width) ||
          result.width < 1 ||
          result.width > limits.dimension ||
          typeof result.height !== "number" ||
          !Number.isSafeInteger(result.height) ||
          result.height < 1 ||
          result.height > limits.dimension
        )
          return fail();
        settled = true;
        clear();
        resolve({
          content: result.content,
          width: result.width,
          height: result.height,
        });
      };
      const timer = setTimeout(fail, limits.transformMs);
      signal?.addEventListener("abort", abort, { once: true });
      child.once("exit", fail);
      child.once("error", fail);
      child.on("message", onMessage);
      if (signal?.aborted) return fail();
      try {
        child.send(
          { type: "kado:image:transform", content, limits },
          (error) => {
            if (error) fail();
          },
        );
      } catch {
        fail();
      }
    });
  } finally {
    await stopImageWorker();
    if (active === child) active = undefined;
  }
}
