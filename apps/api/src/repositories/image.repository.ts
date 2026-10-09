import { query, type DbExecutor } from "../db";
import type { GiftSuggestionDto } from "@kado/shared";
import { HttpError } from "../lib/http-errors";
import { getConfig } from "../lib/config";
export async function syncSuggestionImages(
  participantId: string,
  wishlist: GiftSuggestionDto[],
  db: DbExecutor,
) {
  const ids = [
    ...new Set(wishlist.flatMap((s) => (s.imageId ? [s.imageId] : []))),
  ];
  const rows = await query<{ id: string }>(
    `SELECT id FROM suggestion_images WHERE participant_id=$1 AND id=ANY($2::text[])
    AND (expires_at IS NULL OR expires_at > clock_timestamp()) FOR UPDATE`,
    [participantId, ids],
    db,
  );
  if (rows.rows.length !== ids.length)
    throw new HttpError(400, "Invalid image reference.", {
      code: "IMAGE_REFERENCE_INVALID",
    });
  await query(
    `UPDATE suggestion_images SET expires_at=clock_timestamp()+$3 * interval '1 millisecond'
    WHERE participant_id=$1 AND expires_at IS NULL AND NOT (id=ANY($2::text[]))`,
    [participantId, ids, getConfig().images.ttlMs],
    db,
  );
  await query(
    `UPDATE suggestion_images SET expires_at=NULL WHERE participant_id=$1 AND id=ANY($2::text[])`,
    [participantId, ids],
    db,
  );
}
export async function insertImage(
  id: string,
  participantId: string,
  exchangeId: string,
  image: { content: Buffer; width: number; height: number },
  db: DbExecutor,
) {
  // All uploads are serialized by the single-instance admission gate through COMMIT.
  const totals = await query<{
    owner: string;
    exchange: string;
    total: string;
  }>(
    `SELECT
    COALESCE(sum(octet_length(i.content)) FILTER (WHERE i.participant_id=$1),0)::text AS owner,
    COALESCE(sum(octet_length(i.content)) FILTER (WHERE p.exchange_id=$2),0)::text AS exchange,
    COALESCE(sum(octet_length(i.content)),0)::text AS total FROM suggestion_images i JOIN participants p ON p.id=i.participant_id`,
    [participantId, exchangeId],
    db,
  );
  const t = totals.rows[0]!,
    c = getConfig().images,
    size = image.content.length;
  if (
    Number(t.owner) + size > c.participantBytes ||
    Number(t.exchange) + size > c.exchangeBytes ||
    Number(t.total) + size > c.totalBytes
  )
    throw new HttpError(413, "Image storage quota exceeded.", {
      code: "IMAGE_QUOTA_EXCEEDED",
    });
  await query(
    `INSERT INTO suggestion_images(id,participant_id,content,width,height,expires_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp()+$6*interval '1 millisecond')`,
    [id, participantId, image.content, image.width, image.height, c.ttlMs],
    db,
  );
}
