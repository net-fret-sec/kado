import { query, type DbExecutor } from "../db";

interface ExchangeRecord {
  id: string;
  name: string;
  description?: string;
  organizerId: string;
  eventDate?: string;
  budget?: number;
  minWishlistSuggestions?: number;
  lockSuggestionsAfterDraw?: boolean;
  noMutualAssignments?: boolean;
  drawAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminAccessRecord {
  exchangeId: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminSessionRecord {
  id: string;
  exchangeId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

interface ExchangeRow {
  id: string;
  name: string;
  description: string | null;
  organizer_id: string;
  event_date: string | null;
  budget: string | null;
  min_wishlist_suggestions: number;
  lock_suggestions_after_draw: boolean;
  no_mutual_assignments: boolean;
  draw_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminAccessRow {
  exchange_id: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

interface AdminSessionRow {
  id: string;
  exchange_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
}

function mapExchangeRow(row: ExchangeRow): ExchangeRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    organizerId: row.organizer_id,
    eventDate: row.event_date ?? undefined,
    budget: row.budget === null ? undefined : Number(row.budget),
    minWishlistSuggestions: row.min_wishlist_suggestions,
    lockSuggestionsAfterDraw: row.lock_suggestions_after_draw,
    noMutualAssignments: row.no_mutual_assignments,
    drawAt: row.draw_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdminAccessRow(row: AdminAccessRow): AdminAccessRecord {
  return {
    exchangeId: row.exchange_id,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdminSessionRow(row: AdminSessionRow): AdminSessionRecord {
  return {
    id: row.id,
    exchangeId: row.exchange_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

const UPDATE_COLUMN_BY_FIELD: Record<string, string> = {
  name: "name",
  description: "description",
  organizerId: "organizer_id",
  eventDate: "event_date",
  budget: "budget",
  minWishlistSuggestions: "min_wishlist_suggestions",
  lockSuggestionsAfterDraw: "lock_suggestions_after_draw",
  noMutualAssignments: "no_mutual_assignments",
  drawAt: "draw_at",
};

export const exchangeRepository = {
  async create(exchange: ExchangeRecord, db?: DbExecutor) {
    await query(
      `
        INSERT INTO exchanges (
          id, name, description, organizer_id,
          event_date, budget, min_wishlist_suggestions,
          lock_suggestions_after_draw, no_mutual_assignments,
          draw_at, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9,
          $10, $11, $12
        )
      `,
      [
        exchange.id,
        exchange.name,
        exchange.description ?? null,
        exchange.organizerId,
        exchange.eventDate ?? null,
        exchange.budget ?? null,
        exchange.minWishlistSuggestions ?? 0,
        exchange.lockSuggestionsAfterDraw ?? true,
        exchange.noMutualAssignments ?? false,
        exchange.drawAt ?? null,
        exchange.createdAt,
        exchange.updatedAt,
      ],
      db,
    );

    return exchange;
  },

  async findById(exchangeId: string, db?: DbExecutor) {
    const result = await query<ExchangeRow>(
      `
        SELECT *
        FROM exchanges
        WHERE id = $1
      `,
      [exchangeId],
      db,
    );

    const row = result.rows[0];
    return row ? mapExchangeRow(row) : undefined;
  },

  async findAll(db?: DbExecutor) {
    const result = await query<ExchangeRow>(
      `
        SELECT *
        FROM exchanges
        ORDER BY created_at ASC
      `,
      undefined,
      db,
    );

    return result.rows.map(mapExchangeRow);
  },

  async update(
    exchangeId: string,
    updates: Partial<ExchangeRecord>,
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

    const result = await query<ExchangeRow>(
      `
        UPDATE exchanges
        SET
          ${setClauses.length > 0 ? `${setClauses.join(", ")},` : ""}
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [exchangeId, ...values],
      db,
    );

    const row = result.rows[0];
    return row ? mapExchangeRow(row) : null;
  },

  async updateIfUnchanged(
    exchangeId: string,
    updates: Partial<ExchangeRecord>,
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

    const result = await query<ExchangeRow>(
      `
        UPDATE exchanges
        SET
          ${setClauses.length > 0 ? `${setClauses.join(", ")},` : ""}
          updated_at = NOW()
        WHERE id = $1
          AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $${values.length + 2}::timestamptz)
        RETURNING *
      `,
      [exchangeId, ...values, expectedUpdatedAt],
      db,
    );

    const row = result.rows[0];
    return row ? mapExchangeRow(row) : null;
  },

  async delete(exchangeId: string, db?: DbExecutor) {
    const result = await query(
      `
        DELETE FROM exchanges
        WHERE id = $1
      `,
      [exchangeId],
      db,
    );

    return (result.rowCount ?? 0) > 0;
  },

  async createAdminAccess(record: AdminAccessRecord, db?: DbExecutor) {
    await query(
      `
        INSERT INTO admin_access (exchange_id, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4)
      `,
      [
        record.exchangeId,
        record.passwordHash,
        record.createdAt,
        record.updatedAt,
      ],
      db,
    );

    return record;
  },

  async findAdminAccess(exchangeId: string, db?: DbExecutor) {
    const result = await query<AdminAccessRow>(
      `
        SELECT *
        FROM admin_access
        WHERE exchange_id = $1
      `,
      [exchangeId],
      db,
    );

    const row = result.rows[0];
    return row ? mapAdminAccessRow(row) : undefined;
  },

  async updateAdminAccessPassword(
    exchangeId: string,
    passwordHash: string,
    db?: DbExecutor,
  ) {
    const result = await query<AdminAccessRow>(
      `
        UPDATE admin_access
        SET password_hash = $2, updated_at = NOW()
        WHERE exchange_id = $1
        RETURNING *
      `,
      [exchangeId, passwordHash],
      db,
    );

    const row = result.rows[0];
    return row ? mapAdminAccessRow(row) : undefined;
  },

  async createAdminSession(record: AdminSessionRecord, db?: DbExecutor) {
    await query(
      `
        INSERT INTO admin_sessions (id, exchange_id, token_hash, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        record.id,
        record.exchangeId,
        record.tokenHash,
        record.createdAt,
        record.expiresAt,
      ],
      db,
    );

    return record;
  },

  async findAdminSessionByTokenHash(tokenHash: string, db?: DbExecutor) {
    const result = await query<AdminSessionRow>(
      `
        SELECT *
        FROM admin_sessions
        WHERE token_hash = $1
      `,
      [tokenHash],
      db,
    );

    const row = result.rows[0];
    return row ? mapAdminSessionRow(row) : undefined;
  },

  async deleteAdminSessionByTokenHash(tokenHash: string, db?: DbExecutor) {
    const result = await query(
      `
        DELETE FROM admin_sessions
        WHERE token_hash = $1
      `,
      [tokenHash],
      db,
    );

    return (result.rowCount ?? 0) > 0;
  },

  async loadTestData(_data: {
    exchanges: ExchangeRecord[];
    adminAccess: AdminAccessRecord[];
    adminSessions: AdminSessionRecord[];
  }) {
    // Intentionally no-op: this migration starts from an empty database.
  },
};
