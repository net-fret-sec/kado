import type { CreateExclusionRuleInputDto, ExclusionRule } from "@kado/shared";
import { generateId } from "../lib/crypto";
import { BadRequestError, NotFoundError } from "../lib/http-errors";
import { exchangeRepository } from "../repositories/exchange.repository";
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

async function assertExchangeEditable(exchangeId: string) {
  const exchange = await assertExchangeExists(exchangeId);

  const isDrawn = Boolean(exchange.drawAt);
  const isArchived = (() => {
    if (!exchange.eventDate) return false;
    const eventLocalEnd = new Date(`${exchange.eventDate}T23:59:59.999`);
    if (Number.isNaN(eventLocalEnd.getTime())) return false;
    return Date.now() > eventLocalEnd.getTime() + 30 * 24 * 60 * 60 * 1000;
  })();

  if (isDrawn || isArchived) {
    throw new BadRequestError(
      "Exclusion rules cannot be modified for this exchange.",
      {
        code: "EXCLUSION_RULES_LOCKED",
      },
    );
  }

  return exchange;
}

async function assertParticipantBelongsToExchange(
  exchangeId: string,
  participantId: string,
) {
  const participant = await participantRepository.findById(participantId);

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
  await assertExchangeEditable(exchangeId);

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
  );
  await assertParticipantBelongsToExchange(
    exchangeId,
    input.receiverParticipantId,
  );

  if (
    await exclusionRuleRepository.existsByExchangeAndPair(
      exchangeId,
      input.giverParticipantId,
      input.receiverParticipantId,
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

  return await exclusionRuleRepository.create(rule);
}

export async function deleteExclusionRule(
  exchangeId: string,
  ruleId: string,
): Promise<void> {
  await assertExchangeEditable(exchangeId);

  const rule = await exclusionRuleRepository.findById(ruleId);

  if (!rule || rule.exchangeId !== exchangeId) {
    throw new NotFoundError("Exclusion rule not found.", {
      code: "EXCLUSION_RULE_NOT_FOUND",
    });
  }

  await exclusionRuleRepository.deleteById(ruleId);
}
