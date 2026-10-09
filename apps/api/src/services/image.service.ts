import { query, withTransaction, type DbExecutor } from "../db";
import {
  withExchangeTransaction,
  type ExchangeRecord,
} from "../lib/exchange-transaction";
import {
  withParticipantAccess,
  requireParticipant,
} from "./participant.service";
import { isExchangeDrawn, assertNotArchived } from "../lib/exchange-state";
import { HttpError } from "../lib/http-errors";
import { generateId } from "../lib/crypto";
import { insertImage } from "../repositories/image.repository";
import { exchangeRepository } from "../repositories/exchange.repository";
import type { ParticipantDto } from "@kado/shared";
export type ImageActor =
  | { exchangeId: string; participantId: string }
  | { token: string };
export function withImageActor<T>(
  actor: ImageActor,
  operation: (
    exchange: ExchangeRecord,
    participant: ParticipantDto,
    db: DbExecutor,
  ) => Promise<T>,
): Promise<T> {
  if ("token" in actor)
    return withParticipantAccess(actor.token, ({ exchange, participant }, db) =>
      operation(exchange, participant, db),
    );
  return withExchangeTransaction(actor.exchangeId, async (exchange, db) => {
    const participant = await requireParticipant(
      exchange.id,
      actor.participantId,
      db,
    );
    return operation(exchange, participant, db);
  });
}
export function assertUploadAllowed(
  exchange: ExchangeRecord,
  participant: ParticipantDto,
) {
  assertNotArchived(exchange);
  if (participant.status !== "active")
    throw new HttpError(404, "Participant not found.", {
      code: "PARTICIPANT_NOT_FOUND",
    });
  if (isExchangeDrawn(exchange) && (exchange.lockSuggestionsAfterDraw ?? true))
    throw new HttpError(400, "Suggestion modifications disabled.", {
      code: "PARTICIPANT_SUGGESTIONS_LOCKED",
    });
}
export async function storeImage(
  actor: ImageActor,
  image: { content: Buffer; width: number; height: number },
) {
  return withImageActor(actor, async (exchange, participant, db) => {
    assertUploadAllowed(exchange, participant);
    const imageId = generateId("img");
    await insertImage(imageId, participant.id, exchange.id, image, db);
    return {
      imageId,
      width: image.width,
      height: image.height,
      byteSize: image.content.length,
    };
  });
}
export async function readImage(actor: ImageActor, imageId: string) {
  return withImageActor(actor, async (exchange, participant, db) => {
    const image = (
      await query<{
        content: Buffer;
        participant_id: string;
        expires_at: Date | null;
      }>(
        `SELECT i.content,i.participant_id,i.expires_at FROM suggestion_images i
      JOIN participants p ON p.id=i.participant_id WHERE i.id=$1 AND p.exchange_id=$2 AND p.status='active'
      AND (i.expires_at IS NULL OR i.expires_at>clock_timestamp())`,
        [imageId, exchange.id],
        db,
      )
    ).rows[0];
    const missing = () =>
      new HttpError(404, "Image not found.", { code: "IMAGE_NOT_FOUND" });
    if (!image) throw missing();
    if (image.participant_id === participant.id) return image.content;
    if (!("token" in actor) || image.expires_at || !isExchangeDrawn(exchange))
      throw missing();
    const assigned = await query(
      `SELECT 1 FROM assignments a JOIN participants p ON p.id=a.receiver_participant_id
      WHERE a.exchange_id=$1 AND a.giver_participant_id=$2 AND a.receiver_participant_id=$3
      AND p.wishlist @> $4::jsonb`,
      [
        exchange.id,
        participant.id,
        image.participant_id,
        JSON.stringify([{ imageId }]),
      ],
      db,
    );
    if (!assigned.rowCount) throw missing();
    return image.content;
  });
}
export async function runImageCleanup() {
  const deadline = Date.now() + 10000;
  while ((await cleanupExpiredImages()) === 100 && Date.now() < deadline) {
    /* Each transaction is bounded; continue next hour if needed. */
  }
}
export async function cleanupExpiredImages(batchSize = 100) {
  const rows = await query<{ id: string; exchange_id: string }>(
    `SELECT i.id,p.exchange_id FROM suggestion_images i JOIN participants p ON p.id=i.participant_id
    WHERE i.expires_at<=clock_timestamp() ORDER BY i.expires_at LIMIT $1`,
    [batchSize],
  );
  for (const row of rows.rows)
    await withTransaction(async (db) => {
      if (!(await exchangeRepository.findByIdForUpdate(row.exchange_id, db)))
        return;
      await query(
        `DELETE FROM suggestion_images WHERE id=$1 AND expires_at<=clock_timestamp()`,
        [row.id],
        db,
      );
    });
  return rows.rows.length;
}
