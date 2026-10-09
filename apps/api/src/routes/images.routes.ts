import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireAdminSession } from "../middleware/require-admin-session";
import { getConfig } from "../lib/config";
import { HttpError } from "../lib/http-errors";
import { transformImage } from "../image-worker";
import {
  withImageActor,
  assertUploadAllowed,
  storeImage,
  readImage,
  type ImageActor,
} from "../services/image.service";
// One admission slot includes parsing, conversion and database COMMIT, so quotas cannot race.
let occupied = false;
const actor = (req: Request): ImageActor =>
  req.params.token
    ? { token: String(req.params.token) }
    : {
        exchangeId: String(req.params.exchangeId),
        participantId: String(req.params.participantId),
      };
async function receive(req: Request, res: Response, signal: AbortSignal) {
  const c = getConfig().images;
  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error);
      else if (!req.file)
        reject(
          new HttpError(400, "Image required.", { code: "IMAGE_INVALID_FILE" }),
        );
      else resolve(req.file.buffer);
    };
    const aborted = () =>
      finish(
        new HttpError(503, "Upload interrupted.", {
          code: "IMAGE_PROCESSING_INTERRUPTED",
        }),
      );
    const timer = setTimeout(() => {
      finish(
        new HttpError(503, "Upload timed out.", {
          code: "IMAGE_PROCESSING_INTERRUPTED",
        }),
      );
      req.unpipe();
      res.setHeader("Connection", "close");
      res.once("finish", () => req.destroy());
      req.resume();
    }, c.receiveMs);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) return aborted();
    multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: c.sourceBytes,
        files: 1,
        fields: 0,
        parts: 1,
        headerPairs: 50,
      },
    }).single("image")(req, res, (error) => {
      if (error)
        finish(
          new HttpError(
            error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
            "Invalid upload.",
            {
              code:
                error.code === "LIMIT_FILE_SIZE"
                  ? "IMAGE_TOO_LARGE"
                  : "IMAGE_INVALID_FILE",
            },
          ),
        );
      else finish();
    });
  });
}
export default function imageRoutes() {
  const router = Router();
  for (const base of [
    "/exchanges/:exchangeId/participants/:participantId/images",
    "/p/:token/images",
  ]) {
    const participant = base.startsWith("/p/");
    const log = (req: Request, res: Response, next: () => void) => {
      res.locals.logRoute =
        "/api" + base + (req.method === "GET" ? "/:imageId" : "");
      next();
    };
    const auth = participant
      ? (req: Request, res: Response, next: () => void) =>
          req.app.locals.limits.participant(req, res, next)
      : requireAdminSession;
    router.post(
      base,
      log,
      auth,
      (req, res, next) => req.app.locals.limits.imageUpload(req, res, next),
      async (req, res, next) => {
        const controller = new AbortController();
        const aborted = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.once("close", aborted);
        let acquired = false;
        try {
          const context = actor(req);
          await withImageActor(context, async (exchange, p) =>
            assertUploadAllowed(exchange, p),
          );
          if (occupied)
            throw new HttpError(503, "Image service busy.", {
              code: "IMAGE_UPLOAD_BUSY",
            });
          occupied = true;
          acquired = true;
          const content = await receive(req, res, controller.signal);
          const image = await transformImage(content, controller.signal);
          if (controller.signal.aborted)
            throw new HttpError(503, "Upload interrupted.", {
              code: "IMAGE_PROCESSING_INTERRUPTED",
            });
          res.status(201).json(await storeImage(context, image));
        } catch (error) {
          next(error);
        } finally {
          res.removeListener("close", aborted);
          if (acquired) occupied = false;
        }
      },
    );
    router.get(base + "/:imageId", log, auth, async (req, res, next) => {
      try {
        const content = await readImage(actor(req), String(req.params.imageId));
        res
          .type("image/webp")
          .set("X-Content-Type-Options", "nosniff")
          .send(content);
      } catch (error) {
        next(error);
      }
    });
  }
  return router;
}
