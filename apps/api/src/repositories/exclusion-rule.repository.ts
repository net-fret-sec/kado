import { query, type DbExecutor } from "../db";

interface ExclusionRuleRecord {
  id: string;
  exchangeId: string;
  giverParticipantId: string;
  receiverParticipantId: string;
  type: "manual";
  createdAt: string;
}

interface ExclusionRuleRow {
  id: string;
  exchange_id: string;
  giver_participant_id: string;
  receiver_participant_id: string;
  type: "manual";
  created_at: string;
}

function mapExclusionRuleRow(row: ExclusionRuleRow): ExclusionRuleRecord {
  return {
    id: row.id,
    exchangeId: row.exchange_id,
    giverParticipantId: row.giver_participant_id,
    receiverParticipantId: row.receiver_participant_id,
    type: row.type,
    createdAt: row.created_at,
  };
}

export const exclusionRuleRepository = {
  async create(rule: ExclusionRuleRecord, db?: DbExecutor) {
    await query(
      `
        INSERT INTO exclusion_rules (
          id, exchange_id, giver_participant_id, receiver_participant_id, type, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        rule.id,
        rule.exchangeId,
        rule.giverParticipantId,
        rule.receiverParticipantId,
        rule.type,
        rule.createdAt,
      ],
      db,
    );

    return rule;
  },

  async findById(ruleId: string, db?: DbExecutor) {
    const result = await query<ExclusionRuleRow>(
      `
        SELECT *
        FROM exclusion_rules
        WHERE id = $1
      `,
      [ruleId],
      db,
    );

    const row = result.rows[0];
    return row ? mapExclusionRuleRow(row) : undefined;
  },

  async findByExchangeId(exchangeId: string, db?: DbExecutor) {
    const result = await query<ExclusionRuleRow>(
      `
        SELECT *
        FROM exclusion_rules
        WHERE exchange_id = $1
        ORDER BY created_at ASC
      `,
      [exchangeId],
      db,
    );

    return result.rows.map(mapExclusionRuleRow);
  },

  async existsByExchangeAndPair(
    exchangeId: string,
    giverParticipantId: string,
    receiverParticipantId: string,
    db?: DbExecutor,
  ) {
    const result = await query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM exclusion_rules
          WHERE exchange_id = $1
            AND giver_participant_id = $2
            AND receiver_participant_id = $3
        ) AS exists
      `,
      [exchangeId, giverParticipantId, receiverParticipantId],
      db,
    );

    return result.rows[0]?.exists ?? false;
  },

  async deleteById(ruleId: string, db?: DbExecutor) {
    const result = await query(
      `
        DELETE FROM exclusion_rules
        WHERE id = $1
      `,
      [ruleId],
      db,
    );

    return (result.rowCount ?? 0) > 0;
  },

  async deleteByExchangeId(exchangeId: string, db?: DbExecutor) {
    const result = await query(
      `
        DELETE FROM exclusion_rules
        WHERE exchange_id = $1
      `,
      [exchangeId],
      db,
    );

    return result.rowCount ?? 0;
  },
};
