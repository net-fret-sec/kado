import type { CreateExclusionRuleInputDto, ExclusionRule } from "@kado/shared";
import { generateId } from "../lib/crypto";
import { BadRequestError, NotFoundError } from "../lib/http-errors";
import { exchangeRepository } from "../repositories/exchange.repository";
import { type DbExecutor } from "../db";
import {
  withExchangeTransaction,
  type ExchangeRecord,
} from "../lib/exchange-transaction";
import { isExchangeArchived, isExchangeDrawn } from "../lib/exchange-state";
import { exclusionRuleRepository } from "../repositories/exclusion-rule.repository";
import { participantRepository } from "../repositories/participant.repository";

async function assertExchangeExists(exchangeId: string) {
  const exchange = await exchangeRepository.findById(exchangeId);
  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }
  return exchange;
}

function assertExchangeEditable(exchange: ExchangeRecord) {
  if (isExchangeDrawn(exchange) || isExchangeArchived(exchange)) {
    throw new BadRequestError(
      "Exclusion rules cannot be modified for this exchange.",
      { code: "EXCLUSION_RULES_LOCKED" },
    );
  }
}

async function assertParticipantBelongsToExchange(
  exchangeId: string,
  participantId: string,
  db: DbExecutor,
) {
  const participant = await participantRepository.findById(
    exchangeId,
    participantId,
    db,
  );

  if (
    !participant ||
    participant.exchangeId !== exchangeId ||
    participant.status !== "active"
  ) {
    throw new BadRequestError("Participant does not belong to this exchange.", {
      code: "PARTICIPANT_OUTSIDE_EXCHANGE",
    });
  }

  return participant;
}

export async function listExclusionRules(
  exchangeId: string,
): Promise<ExclusionRule[]> {
  await assertExchangeExists(exchangeId);
  return exclusionRuleRepository.findByExchangeId(exchangeId);
}

export async function createExclusionRule(
  exchangeId: string,
  input: CreateExclusionRuleInputDto,
): Promise<ExclusionRule> {
  return withExchangeTransaction(exchangeId, async (exchange, db) => {
    assertExchangeEditable(exchange);

    if (input.giverParticipantId === input.receiverParticipantId) {
      throw new BadRequestError(
        "A participant cannot be excluded from drawing themselves.",
        {
          code: "EXCLUSION_SELF_NOT_ALLOWED",
        },
      );
    }

    await assertParticipantBelongsToExchange(
      exchangeId,
      input.giverParticipantId,
      db,
    );
    await assertParticipantBelongsToExchange(
      exchangeId,
      input.receiverParticipantId,
      db,
    );

    if (
      await exclusionRuleRepository.existsByExchangeAndPair(
        exchangeId,
        input.giverParticipantId,
        input.receiverParticipantId,
        db,
      )
    ) {
      throw new BadRequestError("This exclusion rule already exists.", {
        code: "EXCLUSION_RULE_ALREADY_EXISTS",
      });
    }

    const rule: ExclusionRule = {
      id: generateId("exr"),
      exchangeId,
      giverParticipantId: input.giverParticipantId,
      receiverParticipantId: input.receiverParticipantId,
      type: "manual",
      createdAt: new Date().toISOString(),
    };

    return await exclusionRuleRepository.create(rule, db);
  });
}

export async function deleteExclusionRule(
  exchangeId: string,
  ruleId: string,
): Promise<void> {
  return withExchangeTransaction(exchangeId, async (exchange, db) => {
    assertExchangeEditable(exchange);

    const rule = await exclusionRuleRepository.findById(ruleId, db);

    if (!rule || rule.exchangeId !== exchangeId) {
      throw new NotFoundError("Exclusion rule not found.", {
        code: "EXCLUSION_RULE_NOT_FOUND",
      });
    }

    await exclusionRuleRepository.deleteById(ruleId, db);
  });
}
