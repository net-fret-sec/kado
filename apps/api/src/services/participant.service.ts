import type {
  CreateParticipantInputDto,
  CreateParticipantResultDto,
  ParticipantDto,
  ParticipantSelfViewDto,
  UpdateParticipantInputDto,
} from '@kado/shared'
import { BadRequestError, NotFoundError } from '../lib/http-errors'
import { generateId, generateOpaqueToken, sha256 } from '../lib/crypto'
import { exchangeRepository } from '../repositories/exchange.repository'
import { participantRepository } from '../repositories/participant.repository'
import { assignmentRepository } from '../repositories/assignment.repository'

function getPublicBaseUrl(): string {
  const base =
    process.env.PUBLIC_BASE_URL || process.env.FRONTEND_BASE_URL || 'http://localhost:5173'

  return base.endsWith('/') ? base.slice(0, -1) : base
}

export async function createParticipant(
  exchangeId: string,
  input: CreateParticipantInputDto,
): Promise<CreateParticipantResultDto> {
  const exchange = exchangeRepository.findById(exchangeId)

  if (!exchange) {
    throw new NotFoundError('Exchange not found.', {
      code: 'EXCHANGE_NOT_FOUND',
    })
  }

  const now = new Date().toISOString()

  const participant: ParticipantDto = {
    id: generateId('par'),
    exchangeId,
    name: input.name,
    email: input.email,
    wishlist: input.wishlist,
    note: input.note,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  participantRepository.create(participant)

  const rawToken = generateOpaqueToken('p')
  participantRepository.createAccess({
    id: generateId('pacc'),
    exchangeId,
    participantId: participant.id,
    tokenHash: sha256(rawToken),
    tokenPreview: `${rawToken.slice(0, 6)}…${rawToken.slice(-4)}`,
    status: 'active',
    createdAt: now,
  })

  return {
    participant,
    accessLink: `${getPublicBaseUrl()}/p/${rawToken}`,
  }
}

export async function getParticipantsByExchangeId(exchangeId: string) {
  return participantRepository.findByExchangeId(exchangeId)
}

export async function getParticipantById(participantId: string): Promise<ParticipantDto> {
  const participant = participantRepository.findById(participantId)

  if (!participant) {
    throw new NotFoundError('Participant not found.', {
      code: 'PARTICIPANT_NOT_FOUND',
    })
  }

  return participant
}

export async function updateParticipant(
  participantId: string,
  input: UpdateParticipantInputDto,
): Promise<ParticipantDto> {
  const participant = participantRepository.findById(participantId)

  if (!participant) {
    throw new NotFoundError('Participant not found.', {
      code: 'PARTICIPANT_NOT_FOUND',
    })
  }

  const updated = participantRepository.update(participantId, input)

  if (!updated) {
    throw new NotFoundError('Participant not found.', {
      code: 'PARTICIPANT_NOT_FOUND',
    })
  }

  return updated
}

export async function deleteParticipant(participantId: string): Promise<void> {
  const participant = participantRepository.findById(participantId)

  if (!participant) {
    throw new NotFoundError('Participant not found.', {
      code: 'PARTICIPANT_NOT_FOUND',
    })
  }

  participantRepository.delete(participantId)
}

export async function regenerateParticipantAccess(
  participantId: string,
  revokeExisting: boolean = true,
): Promise<{ participantId: string; accessLink: string }> {
  const participant = participantRepository.findById(participantId)
  if (!participant) {
    throw new NotFoundError('Participant not found.', {
      code: 'PARTICIPANT_NOT_FOUND',
    })
  }

  const now = new Date().toISOString()
  const rawToken = generateOpaqueToken('p')

  if (revokeExisting) {
    participantRepository.revokeActiveAccessForParticipant(participantId)
  }

  participantRepository.createAccess({
    id: generateId('pacc'),
    exchangeId: participant.exchangeId,
    participantId: participant.id,
    tokenHash: sha256(rawToken),
    tokenPreview: `${rawToken.slice(0, 6)}…${rawToken.slice(-4)}`,
    status: 'active',
    createdAt: now,
  })

  return {
    participantId: participant.id,
    accessLink: `${getPublicBaseUrl()}/p/${rawToken}`,
  }
}

export async function getParticipantSelfViewByToken(
  rawToken: string,
): Promise<ParticipantSelfViewDto> {
  const { access, participant, exchange } = resolveParticipantAccess(rawToken)

  participantRepository.touchAccess(access.id)

  const assignment =
    exchange.status === 'drawn'
      ? assignmentRepository.findByExchangeAndGiver(exchange.id, participant.id)
      : undefined

  const receiver = assignment
    ? participantRepository.findById(assignment.receiverParticipantId)
    : undefined

  return {
    exchange: {
      id: exchange.id,
      name: exchange.name,
      description: exchange.description,
      status: exchange.status,
      eventDate: exchange.eventDate,
      budget: exchange.budget,
      budgetCurrency: exchange.budgetCurrency,
    },
    participant: {
      id: participant.id,
      name: participant.name,
      email: participant.email,
      wishlist: participant.wishlist,
      note: participant.note,
    },
    assignment: receiver
      ? {
          receiverName: receiver.name,
          receiverWishlist: receiver.wishlist,
          receiverNote: receiver.note,
        }
      : undefined,
  }
}

export async function updateParticipantSelfByToken(
  rawToken: string,
  input: UpdateParticipantInputDto,
): Promise<ParticipantSelfViewDto> {
  const { access, participant, exchange } = resolveParticipantAccess(rawToken)

  if (exchange.status === 'drawn' || exchange.status === 'archived') {
    throw new BadRequestError('Participant updates are closed for this exchange.', {
      code: 'PARTICIPANT_UPDATES_CLOSED',
    })
  }

  const updated = participantRepository.update(participant.id, input)
  if (!updated) {
    throw new NotFoundError('Participant not found.', {
      code: 'PARTICIPANT_NOT_FOUND',
    })
  }

  participantRepository.touchAccess(access.id)

  return {
    exchange: {
      id: exchange.id,
      name: exchange.name,
      description: exchange.description,
      status: exchange.status,
      eventDate: exchange.eventDate,
      budget: exchange.budget,
      budgetCurrency: exchange.budgetCurrency,
    },
    participant: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      wishlist: updated.wishlist,
      note: updated.note,
    },
    assignment: undefined,
  }
}

function resolveParticipantAccess(rawToken: string) {
  const tokenHash = sha256(rawToken)
  const access = participantRepository.findActiveAccessByTokenHash(tokenHash)
  if (!access) {
    throw new NotFoundError('Invalid or expired link.', {
      code: 'PARTICIPANT_LINK_INVALID_OR_EXPIRED',
    })
  }

  const participant = participantRepository.findById(access.participantId)
  if (!participant) {
    throw new NotFoundError('Participant not found.', {
      code: 'PARTICIPANT_NOT_FOUND',
    })
  }

  const exchange = exchangeRepository.findById(access.exchangeId)
  if (!exchange) {
    throw new NotFoundError('Exchange not found.', {
      code: 'EXCHANGE_NOT_FOUND',
    })
  }

  return { access, participant, exchange }
}
