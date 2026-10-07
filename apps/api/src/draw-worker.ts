import path from "node:path";
import { Worker } from "node:worker_threads";
import { getConfig } from "./lib/config";
import { HttpError } from "./lib/http-errors";
interface Assignment {
  giverParticipantId: string;
  receiverParticipantId: string;
}
let active: Worker | undefined;
export async function stopDrawWorker() {
  if (active) await active.terminate();
}
export async function runDraw(
  ids: string[],
  exclusions: Assignment[],
  noMutual: boolean,
): Promise<Assignment[] | null> {
  if (active)
    throw new HttpError(503, "Draw service busy.", { code: "DRAW_BUSY" });
  const c = getConfig();
  const workerPath = path.resolve(__dirname, "workers/draw.worker.cjs");
  const worker = new Worker(workerPath, {
    workerData: [ids, exclusions, noMutual, c.drawNodes, c.drawTimeout],
  });
  active = worker;
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const fail = (code: string) => {
        if (!settled) {
          settled = true;
          reject(
            new HttpError(
              code === "INTERNAL_SERVER_ERROR" ? 500 : 503,
              "Draw interrupted.",
              { code },
            ),
          );
        }
      };
      const timer = setTimeout(
        () => fail("DRAW_COMPUTATION_LIMIT"),
        c.drawTimeout,
      );
      worker.once("error", () => fail("INTERNAL_SERVER_ERROR"));
      worker.once("exit", () => {
        clearTimeout(timer);
        if (!settled) fail("SERVICE_UNAVAILABLE");
      });
      worker.once(
        "message",
        (message: { error?: string; assignments: Assignment[] | null }) => {
          clearTimeout(timer);
          if (settled) return;
          if (message.error) return fail(message.error);
          const a = message.assignments;
          if (
            a &&
            (a.length !== ids.length ||
              new Set(a.map((v) => v.giverParticipantId)).size !== ids.length ||
              new Set(a.map((v) => v.receiverParticipantId)).size !==
                ids.length ||
              a.some(
                (v) =>
                  !ids.includes(v.giverParticipantId) ||
                  !ids.includes(v.receiverParticipantId) ||
                  v.giverParticipantId === v.receiverParticipantId ||
                  exclusions.some(
                    (e) =>
                      e.giverParticipantId === v.giverParticipantId &&
                      e.receiverParticipantId === v.receiverParticipantId,
                  ) ||
                  (noMutual &&
                    a.some(
                      (b) =>
                        b.giverParticipantId === v.receiverParticipantId &&
                        b.receiverParticipantId === v.giverParticipantId,
                    )),
              ))
          )
            return fail("INTERNAL_SERVER_ERROR");
          settled = true;
          resolve(a);
        },
      );
    });
  } finally {
    await worker.terminate();
    if (active === worker) active = undefined;
  }
}
