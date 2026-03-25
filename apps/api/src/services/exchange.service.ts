import type {
  CreateExchangeInputDto,
  CreateExchangeResultDto,
  ExchangeDto,
} from '@kado/shared'
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
