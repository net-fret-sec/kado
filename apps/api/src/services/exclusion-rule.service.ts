import type { CreateExclusionRuleInputDto, ExclusionRule } from '@kado/shared'
import { generateId } from '../lib/crypto'
import { BadRequestError, NotFoundError } from '../lib/http-errors'
import { exchangeRepository } from '../repositories/exchange.repository'
import { exclusionRuleRepository } from '../repositories/exclusion-rule.repository'
import { participantRepository } from '../repositories/participant.repository'

function assertExchangeExists(exchangeId: string) {
  const exchange = exchangeRepository.findById(exchangeId)
  if (!exchange) {
    throw new NotFoundError('Exchange not found.', {
      code: 'EXCHANGE_NOT_FOUND',
    })
  }
  return exchange
}

function assertExchangeEditable(exchangeId: string) {
  const exchange = assertExchangeExists(exchangeId)

  if (exchange.status === 'drawn' || exchange.status === 'archived') {
    throw new BadRequestError('Exclusion rules cannot be modified for this exchange.', {
      code: 'EXCLUSION_RULES_LOCKED',
    })
  }

  return exchange
}

function assertParticipantBelongsToExchange(exchangeId: string, participantId: string) {
  const participant = participantRepository.findById(participantId)

  if (!participant || participant.exchangeId !== exchangeId || participant.status !== 'active') {
    throw new BadRequestError('Participant does not belong to this exchange.', {
      code: 'PARTICIPANT_OUTSIDE_EXCHANGE',
    })
  }

  return participant
}

export async function listExclusionRules(exchangeId: string): Promise<ExclusionRule[]> {
  assertExchangeExists(exchangeId)
  return exclusionRuleRepository.findByExchangeId(exchangeId)
}

export async function createExclusionRule(
  exchangeId: string,
  input: CreateExclusionRuleInputDto,
): Promise<ExclusionRule> {
  assertExchangeEditable(exchangeId)

  if (input.giverParticipantId === input.receiverParticipantId) {
    throw new BadRequestError('A participant cannot be excluded from drawing themselves.', {
      code: 'EXCLUSION_SELF_NOT_ALLOWED',
    })
  }

  assertParticipantBelongsToExchange(exchangeId, input.giverParticipantId)
  assertParticipantBelongsToExchange(exchangeId, input.receiverParticipantId)

  if (
    exclusionRuleRepository.existsByExchangeAndPair(
      exchangeId,
      input.giverParticipantId,
      input.receiverParticipantId,
    )
  ) {
    throw new BadRequestError('This exclusion rule already exists.', {
      code: 'EXCLUSION_RULE_ALREADY_EXISTS',
    })
  }

  const rule: ExclusionRule = {
    id: generateId('exr'),
    exchangeId,
    giverParticipantId: input.giverParticipantId,
    receiverParticipantId: input.receiverParticipantId,
    type: 'manual',
    createdAt: new Date().toISOString(),
  }

  return exclusionRuleRepository.create(rule)
}

export async function deleteExclusionRule(exchangeId: string, ruleId: string): Promise<void> {
  assertExchangeEditable(exchangeId)

  const rule = exclusionRuleRepository.findById(ruleId)

  if (!rule || rule.exchangeId !== exchangeId) {
    throw new NotFoundError('Exclusion rule not found.', {
      code: 'EXCLUSION_RULE_NOT_FOUND',
    })
  }

  exclusionRuleRepository.deleteById(ruleId)
}
