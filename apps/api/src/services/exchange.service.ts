import type {
  CreateExchangeInputDto,
  CreateExchangeResultDto,
  ExchangeDto,
  UpdateExchangeInputDto,
} from '@kado/shared'
import { NotFoundError } from '../lib/http-errors'
import { exchangeRepository } from '../repositories/exchange.repository'
import { generateId, generateOpaqueToken, hashPassword, sha256 } from '../lib/crypto'

export async function createExchange(
  input: CreateExchangeInputDto,
): Promise<CreateExchangeResultDto> {
  const now = new Date().toISOString()

  const exchange: ExchangeDto = {
    id: generateId('exc'),
    name: input.name,
    description: input.description,
    organizerName: input.organizerName,
    status: 'draft',
    eventDate: input.eventDate,
    budget: input.budget,
    budgetCurrency: input.budgetCurrency,
    createdAt: now,
    updatedAt: now,
  }

  exchangeRepository.create(exchange)

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
    exchange,
    adminSessionToken,
  }
}

export async function getExchangeById(exchangeId: string): Promise<ExchangeDto> {
  const exchange = exchangeRepository.findById(exchangeId)

  if (!exchange) {
    throw new NotFoundError('Exchange not found.')
  }

  return exchange
}

export async function listExchanges(): Promise<ExchangeDto[]> {
  return exchangeRepository.findAll()
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

  exchangeRepository.delete(exchangeId)
}
