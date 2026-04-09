import type { GiftSuggestionDto } from "@kado/shared";
import { query, type DbExecutor } from "../db";

interface ParticipantRecord {
  id: string;
  exchangeId: string;
  name: string;
  email?: string;
  wishlist?: GiftSuggestionDto[];
  note?: string;
  status: "active" | "removed";
  createdAt: string;
  updatedAt: string;
}

interface ParticipantAccessRecord {
  id: string;
  exchangeId: string;
  participantId: string;
  tokenHash: string;
  tokenPreview: string;
  status: "active" | "revoked";
  createdAt: string;
  lastAccessedAt?: string;
}

interface ParticipantRow {
  id: string;
  exchange_id: string;
  name: string;
  email: string | null;
  wishlist: GiftSuggestionDto[] | null;
  note: string | null;
  status: "active" | "removed";
  created_at: string;
  updated_at: string;
}

interface ParticipantAccessRow {
  id: string;
  exchange_id: string;
  participant_id: string;
  token_hash: string;
  token_preview: string;
  status: "active" | "revoked";
  created_at: string;
  last_accessed_at: string | null;
}

function mapParticipantRow(row: ParticipantRow): ParticipantRecord {
  return {
    id: row.id,
    exchangeId: row.exchange_id,
    name: row.name,
    email: row.email ?? undefined,
    wishlist: row.wishlist ?? undefined,
    note: row.note ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapParticipantAccessRow(
  row: ParticipantAccessRow,
): ParticipantAccessRecord {
  return {
    id: row.id,
    exchangeId: row.exchange_id,
    participantId: row.participant_id,
    tokenHash: row.token_hash,
    tokenPreview: row.token_preview,
    status: row.status,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at ?? undefined,
  };
}

function serializeWishlist(value: GiftSuggestionDto[] | undefined | null) {
  if (!value) {
    return null;
  }

  return JSON.stringify(value);
}

const UPDATE_COLUMN_BY_FIELD: Record<string, string> = {
  name: "name",
  email: "email",
  wishlist: "wishlist",
  note: "note",
  status: "status",
};

export const participantRepository = {
  async create(participant: ParticipantRecord, db?: DbExecutor) {
    await query(
      `
        INSERT INTO participants (
          id, exchange_id, name, email, wishlist, note, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
      `,
      [
        participant.id,
        participant.exchangeId,
        participant.name,
        participant.email ?? null,
        serializeWishlist(participant.wishlist),
        participant.note ?? null,
        participant.status,
        participant.createdAt,
        participant.updatedAt,
      ],
      db,
    );

    return participant;
  },

  async findById(participantId: string, db?: DbExecutor) {
    const result = await query<ParticipantRow>(
      `
        SELECT *
        FROM participants
        WHERE id = $1
      `,
      [participantId],
      db,
    );

    const row = result.rows[0];
    return row ? mapParticipantRow(row) : undefined;
  },

  async findByExchangeId(exchangeId: string, db?: DbExecutor) {
    const result = await query<ParticipantRow>(
      `
        SELECT *
        FROM participants
        WHERE exchange_id = $1
        ORDER BY created_at ASC
      `,
      [exchangeId],
      db,
    );

    return result.rows.map(mapParticipantRow);
  },

  async update(
    participantId: string,
    updates: Partial<ParticipantRecord>,
    db?: DbExecutor,
  ) {
    const entries = Object.entries(updates).filter(([key]) =>
      Object.prototype.hasOwnProperty.call(UPDATE_COLUMN_BY_FIELD, key),
    );

    const values = entries.map(([field, value]) => {
      if (field === "wishlist") {
        return serializeWishlist(
          (value as GiftSuggestionDto[] | undefined) ?? null,
        );
      }

      return value === undefined ? null : value;
    });

    const setClauses = entries.map(([field], index) => {
      const valuePlaceholder = `$${index + 2}`;
      if (field === "wishlist") {
        return `${UPDATE_COLUMN_BY_FIELD[field]} = ${valuePlaceholder}::jsonb`;
      }

      return `${UPDATE_COLUMN_BY_FIELD[field]} = ${valuePlaceholder}`;
    });

    const result = await query<ParticipantRow>(
      `
        UPDATE participants
        SET
          ${setClauses.length > 0 ? `${setClauses.join(", ")},` : ""}
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [participantId, ...values],
      db,
    );

    const row = result.rows[0];
    return row ? mapParticipantRow(row) : null;
  },

  async updateIfUnchanged(
    participantId: string,
    updates: Partial<ParticipantRecord>,
    expectedUpdatedAt: string,
    db?: DbExecutor,
  ) {
    const entries = Object.entries(updates).filter(([key]) =>
      Object.prototype.hasOwnProperty.call(UPDATE_COLUMN_BY_FIELD, key),
    );

    const setClauses = entries.map(
      ([field], index) => `${UPDATE_COLUMN_BY_FIELD[field]} = $${index + 2}`,
    );
    const values = entries.map(([, value]) =>
      value === undefined ? null : value,
    );

    const result = await query<ParticipantRow>(
      `
        UPDATE participants
        SET
          ${setClauses.length > 0 ? `${setClauses.join(", ")},` : ""}
          updated_at = NOW()
        WHERE id = $1
          AND updated_at = $${values.length + 2}::timestamptz
        RETURNING *
      `,
      [participantId, ...values, expectedUpdatedAt],
      db,
    );

    const row = result.rows[0];
    return row ? mapParticipantRow(row) : null;
  },

  async delete(participantId: string, db?: DbExecutor) {
    const result = await query(
      `
        DELETE FROM participants
        WHERE id = $1
      `,
      [participantId],
      db,
    );

    return (result.rowCount ?? 0) > 0;
  },

  async createAccess(record: ParticipantAccessRecord, db?: DbExecutor) {
    await query(
      `
        INSERT INTO participant_access (
          id, exchange_id, participant_id, token_hash, token_preview, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        record.id,
        record.exchangeId,
        record.participantId,
        record.tokenHash,
        record.tokenPreview,
        record.status,
        record.createdAt,
      ],
      db,
    );

    return record;
  },

  async findActiveAccessByTokenHash(tokenHash: string, db?: DbExecutor) {
    const result = await query<ParticipantAccessRow>(
      `
        SELECT *
        FROM participant_access
        WHERE token_hash = $1 AND status = 'active'
        LIMIT 1
      `,
      [tokenHash],
      db,
    );

    const row = result.rows[0];
    return row ? mapParticipantAccessRow(row) : undefined;
  },

  async touchAccess(accessId: string, db?: DbExecutor) {
    await query(
      `
        UPDATE participant_access
        SET last_accessed_at = NOW()
        WHERE id = $1
      `,
      [accessId],
      db,
    );
  },

  async revokeActiveAccessForParticipant(
    participantId: string,
    db?: DbExecutor,
  ) {
    await query(
      `
        UPDATE participant_access
        SET status = 'revoked', revoked_at = NOW()
        WHERE participant_id = $1 AND status = 'active'
      `,
      [participantId],
      db,
    );
  },

  async loadTestData(_data: {
    participants: ParticipantRecord[];
    participantAccess: ParticipantAccessRecord[];
  }) {
    // Intentionally no-op: this migration starts from an empty database.
  },
};
