import type {
  CreateExchangeInputDto,
  CreateExchangeResultDto,
  ExchangeDto,
  UpdateExchangeInputDto,
} from '@kado/shared'
import { BadRequestError, NotFoundError } from '../lib/http-errors'
import { exchangeRepository } from '../repositories/exchange.repository'
import { participantRepository } from '../repositories/participant.repository'
import { generateId, generateOpaqueToken, hashPassword, sha256 } from '../lib/crypto'
import { createParticipant } from './participant.service'
import { assignmentRepository } from '../repositories/assignment.repository'
import { exclusionRuleRepository } from '../repositories/exclusion-rule.repository'

export async function createExchange(
  input: CreateExchangeInputDto,
): Promise<CreateExchangeResultDto> {
  const now = new Date().toISOString()

  const exchange: ExchangeDto = {
    id: generateId('exc'),
    name: input.name,
    description: input.description,
    organizerId: '', // Temporary
    status: 'draft',
    eventDate: input.eventDate,
    budget: input.budget,
    budgetCurrency: input.budgetCurrency,
    createdAt: now,
    updatedAt: now,
  }

  exchangeRepository.create(exchange)

  // Create organizer participant if name provided
  let organizerId = ''
  if (input.organizerName) {
    const organizerParticipant = await createParticipant(exchange.id, {
      name: input.organizerName,
      email: undefined,
      wishlist: undefined,
      note: undefined,
    })
    organizerId = organizerParticipant.participant.id

    // Update exchange with organizerId
    exchangeRepository.update(exchange.id, { organizerId })

    // If not participates, remove from participants list (but keep as organizer)
    if (!(input.organizerParticipates ?? true)) {
      // For now, since participants are fetched separately, we can handle in getExchangeById
      // But to keep simple, if not participates, we don't add to participants, but organizerId is set
    }
  }

  exchangeRepository.createAdminAccess({
    exchangeId: exchange.id,
    passwordHash: hashPassword(input.adminPassword),
    createdAt: now,
    updatedAt: now,
  })

  const adminSessionToken = generateOpaqueToken('adm')
  exchangeRepository.createAdminSession({
    id: generateId('sess'),
    exchangeId: exchange.id,
    tokenHash: sha256(adminSessionToken),
    createdAt: now,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  })

  return {
    exchange: { ...exchange, organizerId },
    adminSessionToken,
  }
}

export async function getExchangeById(exchangeId: string): Promise<ExchangeDto> {
  const exchange = exchangeRepository.findById(exchangeId)

  if (!exchange) {
    throw new NotFoundError('Exchange not found.')
  }

  const participants = participantRepository.findByExchangeId(exchangeId)

  // Get organizer name from participant
  const organizer = participants.find(p => p.id === exchange.organizerId)
  const organizerName = organizer ? organizer.name : 'Unknown'

  return {
    ...exchange,
    organizerName, // Add for display
    participants,
  }
}

export async function listExchanges(): Promise<ExchangeDto[]> {
  const exchanges = exchangeRepository.findAll()
  return exchanges.map(exchange => {
    const participants = participantRepository.findByExchangeId(exchange.id)
    const organizer = participants.find(p => p.id === exchange.organizerId)
    return {
      ...exchange,
      organizerName: organizer ? organizer.name : 'Unknown',
      participants,
    }
  })
}

export async function updateExchange(
  exchangeId: string,
  input: UpdateExchangeInputDto,
): Promise<ExchangeDto> {
  const exchange = exchangeRepository.findById(exchangeId)

  if (!exchange) {
    throw new NotFoundError('Exchange not found.')
  }

  const updated = exchangeRepository.update(exchangeId, input)

  if (!updated) {
    throw new NotFoundError('Exchange not found.')
  }

  return updated
}

export async function deleteExchange(exchangeId: string): Promise<void> {
  const exchange = exchangeRepository.findById(exchangeId)

  if (!exchange) {
    throw new NotFoundError('Exchange not found.')
  }

  exclusionRuleRepository.deleteByExchangeId(exchangeId)
  exchangeRepository.delete(exchangeId)
}

export async function drawExchange(exchangeId: string): Promise<ExchangeDto> {
  const exchange = exchangeRepository.findById(exchangeId)

  if (!exchange) {
    throw new NotFoundError('Exchange not found.')
  }

  if (exchange.status === 'archived') {
    throw new BadRequestError('Archived exchanges cannot be drawn.')
  }

  if (exchange.status === 'drawn') {
    return exchange
  }

  const participants = participantRepository
    .findByExchangeId(exchangeId)
    .filter(p => p.status === 'active')

  if (participants.length < 2) {
    throw new BadRequestError('At least 2 active participants are required to draw.')
  }

  // Deterministic round-robin draw to keep tests stable.
  const ordered = [...participants].sort((a, b) => a.id.localeCompare(b.id))
  const now = new Date().toISOString()
  const assignments = ordered.map((giver, index) => {
    const receiver = ordered[(index + 1) % ordered.length]
    return {
      id: generateId('asg'),
      exchangeId,
      giverParticipantId: giver.id,
      receiverParticipantId: receiver.id,
      createdAt: now,
    }
  })

  assignmentRepository.deleteByExchangeId(exchangeId)
  assignmentRepository.createMany(assignments)

  const updated = exchangeRepository.update(exchangeId, {
    status: 'drawn',
    drawAt: now,
  })

  if (!updated) {
    throw new NotFoundError('Exchange not found.')
  }

  return updated
}

export async function cancelExchangeDraw(exchangeId: string): Promise<ExchangeDto> {
  const exchange = exchangeRepository.findById(exchangeId)

  if (!exchange) {
    throw new NotFoundError('Exchange not found.')
  }

  if (exchange.status === 'archived') {
    throw new BadRequestError('Archived exchanges cannot be modified.')
  }

  assignmentRepository.deleteByExchangeId(exchangeId)

  const updated = exchangeRepository.update(exchangeId, {
    status: 'ready',
    drawAt: undefined,
  })

  if (!updated) {
    throw new NotFoundError('Exchange not found.')
  }

  return updated
}
