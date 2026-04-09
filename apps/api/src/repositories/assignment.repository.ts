import { query, type DbExecutor } from "../db";

interface AssignmentRecord {
  id: string;
  exchangeId: string;
  giverParticipantId: string;
  receiverParticipantId: string;
  createdAt: string;
}

interface AssignmentRow {
  id: string;
  exchange_id: string;
  giver_participant_id: string;
  receiver_participant_id: string;
  created_at: string;
}

function mapAssignmentRow(row: AssignmentRow): AssignmentRecord {
  return {
    id: row.id,
    exchangeId: row.exchange_id,
    giverParticipantId: row.giver_participant_id,
    receiverParticipantId: row.receiver_participant_id,
    createdAt: row.created_at,
  };
}

export const assignmentRepository = {
  async createMany(records: AssignmentRecord[], db?: DbExecutor) {
    if (records.length === 0) {
      return records;
    }

    const values: unknown[] = [];
    const placeholders = records
      .map((record, index) => {
        const base = index * 5;
        values.push(
          record.id,
          record.exchangeId,
          record.giverParticipantId,
          record.receiverParticipantId,
          record.createdAt,
        );

        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      })
      .join(", ");

    await query(
      `
        INSERT INTO assignments (
          id, exchange_id, giver_participant_id, receiver_participant_id, created_at
        )
        VALUES ${placeholders}
      `,
      values,
      db,
    );

    return records;
  },

  async findByExchangeId(exchangeId: string, db?: DbExecutor) {
    const result = await query<AssignmentRow>(
      `
        SELECT *
        FROM assignments
        WHERE exchange_id = $1
        ORDER BY created_at ASC
      `,
      [exchangeId],
      db,
    );

    return result.rows.map(mapAssignmentRow);
  },

  async findByExchangeAndGiver(
    exchangeId: string,
    giverParticipantId: string,
    db?: DbExecutor,
  ) {
    const result = await query<AssignmentRow>(
      `
        SELECT *
        FROM assignments
        WHERE exchange_id = $1 AND giver_participant_id = $2
        LIMIT 1
      `,
      [exchangeId, giverParticipantId],
      db,
    );

    const row = result.rows[0];
    return row ? mapAssignmentRow(row) : undefined;
  },

  async deleteByExchangeId(exchangeId: string, db?: DbExecutor) {
    const result = await query(
      `
        DELETE FROM assignments
        WHERE exchange_id = $1
      `,
      [exchangeId],
      db,
    );

    return result.rowCount ?? 0;
  },

  async existsForExchange(exchangeId: string, db?: DbExecutor) {
    const result = await query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM assignments
          WHERE exchange_id = $1
        ) AS exists
      `,
      [exchangeId],
      db,
    );

    return result.rows[0]?.exists ?? false;
  },

  async loadTestData(_data: { assignments: AssignmentRecord[] }) {
    // Intentionally no-op: this migration starts from an empty database.
  },
};
