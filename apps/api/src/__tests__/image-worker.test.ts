import childProcess, { type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { transformImage, stopImageWorker } from "../image-worker";

const initialEnv = { ...process.env };
beforeEach(() => {
  jest.restoreAllMocks();
});
afterEach(async () => {
  await stopImageWorker();
  jest.restoreAllMocks();
  process.env = { ...initialEnv };
});
function mockWorker(messages: unknown[]) {
  const child = Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null as NodeJS.Signals | null,
    send: jest.fn(
      (_request: unknown, callback: (error: Error | null) => void) => {
        callback(null);
        queueMicrotask(() =>
          messages.forEach((message) => child.emit("message", message)),
        );
      },
    ),
    kill: jest.fn(() => {
      child.signalCode = "SIGKILL";
      child.emit("exit", null, "SIGKILL");
      return true;
    }),
  });
  jest
    .spyOn(childProcess, "fork")
    .mockReturnValue(child as unknown as ChildProcess);
  return child;
}
const success = {
  type: "kado:image:result",
  content: Buffer.from("output"),
  width: 8,
  height: 8,
};
it("ignores watcher messages until a tagged conversion result arrives", async () => {
  const child = mockWorker([
    { "watch:require": ["worker.cjs"] },
    null,
    "unrelated",
    {},
    success,
  ]);
  await expect(transformImage(Buffer.from("input"))).resolves.toEqual({
    content: success.content,
    width: 8,
    height: 8,
  });
  expect(child.send.mock.calls[0]![0]).toMatchObject({
    type: "kado:image:transform",
  });
  expect(child.kill).toHaveBeenCalledTimes(1);
});
it.each([
  { type: "kado:image:result" },
  { ...success, content: undefined },
  { ...success, content: "invalid" },
  { ...success, width: 0 },
  { ...success, height: NaN },
  { type: "kado:image:result", error: "unknown", status: 400 },
  { type: "kado:image:result", error: "IMAGE_INVALID_FILE", status: 200 },
])(
  "returns a structured interruption for a malformed result: %j",
  async (message) => {
    mockWorker([message]);
    await expect(transformImage(Buffer.from("input"))).rejects.toMatchObject({
      statusCode: 503,
      details: { code: "IMAGE_PROCESSING_INTERRUPTED" },
    });
  },
);
it("preserves the conversion deadline when only watcher messages arrive", async () => {
  process.env.IMAGE_TRANSFORM_TIMEOUT_MS = "20";
  mockWorker([{ "watch:require": ["worker.cjs"] }]);
  await expect(transformImage(Buffer.from("input"))).rejects.toMatchObject({
    statusCode: 503,
    details: { code: "IMAGE_PROCESSING_INTERRUPTED" },
  });
});
it("preserves a recognized image validation error after watcher notifications", async () => {
  mockWorker([
    { "watch:require": ["worker.cjs"] },
    {
      type: "kado:image:result",
      error: "IMAGE_FORMAT_UNSUPPORTED",
      status: 415,
    },
  ]);
  await expect(transformImage(Buffer.from("input"))).rejects.toMatchObject({
    statusCode: 415,
    details: { code: "IMAGE_FORMAT_UNSUPPORTED" },
  });
});
it("converts, rejects an invalid file, then converts again under tsx --watch", async () => {
  const child = childProcess.spawn(
    process.execPath,
    [
      require.resolve("tsx/cli"),
      "--watch",
      path.join(__dirname, "fixtures/image-watch.cjs"),
    ],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
    },
  );
  let stdout = "";
  let stderr = "";
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Watch conversion failed: ${stdout} ${stderr}`)),
        15000,
      );
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        if (stdout.includes("WATCH_CONVERSION_OK")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error(`Watch conversion exited: ${stdout} ${stderr}`));
      });
    });
    expect(stdout).toContain("WATCH_CONVERSION_OK");
    expect(stderr).not.toContain("ERR_INVALID_ARG_TYPE");
  } finally {
    // The CLI, Node watcher, and application form a process group; leave none running.
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    await closed;
  }
}, 20000);
