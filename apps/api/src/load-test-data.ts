import fs from 'fs'
import path from 'path'
import { exchangeRepository } from './repositories/exchange.repository'
import { participantRepository } from './repositories/participant.repository'
import type { GiftSuggestionDto } from '@kado/shared'

interface TestData {
  exchanges: Array<{
    id: string
    name: string
    description?: string
    organizerId: string
    status: 'draft' | 'ready' | 'drawn' | 'archived'
    eventDate?: string
    budget?: number
    budgetCurrency?: string
    createdAt: string
    updatedAt: string
  }>
  participants: Array<{
    id: string
    exchangeId: string
    name: string
    email?: string
    wishlist?: string | GiftSuggestionDto[]
    note?: string
    status: 'active' | 'removed'
    createdAt: string
    updatedAt: string
  }>
  adminAccess: Array<{
    exchangeId: string
    passwordHash: string
    createdAt: string
    updatedAt: string
  }>
  adminSessions: Array<{
    id: string
    exchangeId: string
    tokenHash: string
    createdAt: string
    expiresAt: string
  }>
  participantAccess: Array<{
    id: string
    exchangeId: string
    participantId: string
    tokenHash: string
    tokenPreview: string
    status: 'active' | 'revoked'
    createdAt: string
  }>
}

export function loadTestData() {
  const filePath = path.join(__dirname, 'test-data.json')
  if (!fs.existsSync(filePath)) {
    console.log('Test data file not found, skipping load.')
    return
  }

  try {
    const data: TestData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    // Load exchanges
    exchangeRepository.loadTestData({
      exchanges: data.exchanges,
      adminAccess: data.adminAccess,
      adminSessions: data.adminSessions,
    })

    // Load participants
    participantRepository.loadTestData({
      participants: data.participants,
      participantAccess: data.participantAccess || [],
    })

    console.log(`Loaded ${data.exchanges.length} exchanges, ${data.participants.length} participants, and related data from test-data.json`)
  } catch (error) {
    console.error('Error loading test data:', error)
  }
}
