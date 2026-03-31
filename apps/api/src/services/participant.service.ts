import type {
  CreateParticipantInputDto,
  CreateParticipantResultDto,
  ParticipantDto,
  UpdateParticipantInputDto,
} from '@kado/shared'
import { NotFoundError } from '../lib/http-errors'
import { generateId, generateOpaqueToken, sha256 } from '../lib/crypto'
import { exchangeRepository } from '../repositories/exchange.repository'
import { participantRepository } from '../repositories/participant.repository'

const PUBLIC_BASE_URL = 'http://localhost:5173'

export async function createParticipant(
  exchangeId: string,
  input: CreateParticipantInputDto,
): Promise<CreateParticipantResultDto> {
  const exchange = exchangeRepository.findById(exchangeId)

  if (!exchange) {
    throw new NotFoundError('Exchange not found.')
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
    accessLink: `${PUBLIC_BASE_URL}/p/${rawToken}`,
  }
}

export async function getParticipantsByExchangeId(exchangeId: string) {
  return participantRepository.findByExchangeId(exchangeId)
}

export async function getParticipantById(participantId: string): Promise<ParticipantDto> {
  const participant = participantRepository.findById(participantId)

  if (!participant) {
    throw new NotFoundError('Participant not found.')
  }

  return participant
}

export async function updateParticipant(
  participantId: string,
  input: UpdateParticipantInputDto,
): Promise<ParticipantDto> {
  const participant = participantRepository.findById(participantId)

  if (!participant) {
    throw new NotFoundError('Participant not found.')
  }

  const updated = participantRepository.update(participantId, input)

  if (!updated) {
    throw new NotFoundError('Participant not found.')
  }

  return updated
}

export async function deleteParticipant(participantId: string): Promise<void> {
  const participant = participantRepository.findById(participantId)

  if (!participant) {
    throw new NotFoundError('Participant not found.')
  }

  participantRepository.delete(participantId)
}
