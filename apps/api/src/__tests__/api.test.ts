import request from 'supertest'
import { createApp } from '../app'
import { exchangeRepository } from '../repositories/exchange.repository'

const app = createApp()

let exchangeId: string
let participantId: string
let participantExchangeId: string
let participantAccessToken: string

describe('API Tests', () => {
  describe('Exchanges', () => {

    it('should create an exchange', async () => {
      const response = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'Test Exchange',
          adminPassword: 'testpassword123'
        })
        .expect(201)

      expect(response.body.exchange).toHaveProperty('id')
      expect(response.body.exchange.name).toBe('Test Exchange')
      expect(response.body).toHaveProperty('adminSessionToken')
      exchangeId = response.body.exchange.id
    })

    it('should update an exchange', async () => {
      const response = await request(app)
        .put(`/api/exchanges/${exchangeId}`)
        .send({
          name: 'Updated Exchange',
          description: 'Updated description'
        })
        .expect(200)

      expect(response.body.name).toBe('Updated Exchange')
      expect(response.body.description).toBe('Updated description')
    })

    it('should delete an exchange', async () => {
      await request(app)
        .delete(`/api/exchanges/${exchangeId}`)
        .expect(204)

      // Verify it's deleted
      await request(app)
        .get(`/api/exchanges/${exchangeId}`)
        .expect(404)
    })
  })

  describe('Participants', () => {

    beforeAll(async () => {
      // Create an exchange for participants
      const response = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'Test Exchange for Participants',
          adminPassword: 'testpassword123'
        })
        .expect(201)

      participantExchangeId = response.body.exchange.id
    })

    it('should create a participant', async () => {
      const response = await request(app)
        .post(`/api/exchanges/${participantExchangeId}/participants`)
        .send({
          name: 'Test Participant'
        })
        .expect(201)

      expect(response.body.participant).toHaveProperty('id')
      expect(response.body.participant.name).toBe('Test Participant')
      participantId = response.body.participant.id
    })

    it('should update a participant', async () => {
      const response = await request(app)
        .put(`/api/exchanges/${participantExchangeId}/participants/${participantId}`)
        .send({
          name: 'Updated Participant',
          wishlist: [{ title: 'Updated wishlist' }]
        })
        .expect(200)

      expect(response.body.name).toBe('Updated Participant')
      expect(response.body.wishlist).toEqual([{ title: 'Updated wishlist' }])
    })

    it('should delete a participant', async () => {
      await request(app)
        .delete(`/api/exchanges/${participantExchangeId}/participants/${participantId}`)
        .expect(204)

      // Verify it's deleted
      await request(app)
        .get(`/api/exchanges/${participantExchangeId}/participants`)
        .expect(200)
        .then(res => {
          expect(res.body.length).toBe(0)
        })
    })
  })

  describe('Public participant access', () => {
    beforeAll(async () => {
      const response = await request(app)
        .post(`/api/exchanges/${participantExchangeId}/participants`)
        .send({ name: 'Public Participant' })
        .expect(201)

      const accessLink = response.body.accessLink as string
      participantAccessToken = new URL(accessLink).pathname.split('/').pop() as string
    })

    it('should fetch self view by token', async () => {
      const response = await request(app)
        .get(`/api/p/${participantAccessToken}`)
        .expect(200)

      expect(response.body.exchange.id).toBe(participantExchangeId)
      expect(response.body.participant.name).toBe('Public Participant')
    })

    it('should update participant info by token before draw', async () => {
      const response = await request(app)
        .put(`/api/p/${participantAccessToken}`)
        .send({
          name: 'Participant Public Edit',
          email: 'participant@example.com',
          note: 'Aucune arachide svp',
          wishlist: [
            { title: 'Livre de cuisine', linkUrl: 'https://example.com/livre' },
            { title: 'Chaussettes en laine' },
          ],
        })
        .expect(200)

      expect(response.body.participant.name).toBe('Participant Public Edit')
      expect(response.body.participant.email).toBe('participant@example.com')
      expect(response.body.participant.wishlist).toHaveLength(2)
    })

    it('should reject participant update after draw', async () => {
      exchangeRepository.update(participantExchangeId, { status: 'drawn' })

      const response = await request(app)
        .put(`/api/p/${participantAccessToken}`)
        .send({ name: 'Blocked update' })
        .expect(400)

      expect(response.body.error.message).toMatch(/updates are closed/i)
    })
  })

  describe('Draw mechanism', () => {
    let drawExchangeId: string
    let drawParticipantToken: string

    beforeAll(async () => {
      const exchangeResponse = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'Draw Ready Exchange',
          adminPassword: 'testpassword123',
        })
        .expect(201)

      drawExchangeId = exchangeResponse.body.exchange.id

      const p1 = await request(app)
        .post(`/api/exchanges/${drawExchangeId}/participants`)
        .send({ name: 'Anna', wishlist: [{ title: 'Livre' }] })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${drawExchangeId}/participants`)
        .send({ name: 'Ben', wishlist: [{ title: 'Jeu' }] })
        .expect(201)

      drawParticipantToken = new URL(p1.body.accessLink).pathname.split('/').pop() as string
    })

    it('should trigger draw and set exchange status to drawn', async () => {
      const response = await request(app)
        .post(`/api/exchanges/${drawExchangeId}/draw`)
        .expect(200)

      expect(response.body.status).toBe('drawn')
      expect(response.body.drawAt).toBeTruthy()
    })

    it('should expose assignment in participant self view after draw', async () => {
      const response = await request(app)
        .get(`/api/p/${drawParticipantToken}`)
        .expect(200)

      expect(response.body.exchange.status).toBe('drawn')
      expect(response.body.assignment).toBeTruthy()
      expect(response.body.assignment.receiverName).toBeTruthy()
    })

    it('should reject draw when exchange has less than 2 participants', async () => {
      const exchangeResponse = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'Not enough participants',
          adminPassword: 'testpassword123',
        })
        .expect(201)

      const exchangeId = exchangeResponse.body.exchange.id

      await request(app)
        .post(`/api/exchanges/${exchangeId}/participants`)
        .send({ name: 'Solo' })
        .expect(201)

      const response = await request(app)
        .post(`/api/exchanges/${exchangeId}/draw`)
        .expect(400)

      expect(response.body.error.message).toMatch(/at least 2 active participants/i)
    })

    it('should cancel draw and reopen exchange state', async () => {
      const cancelResponse = await request(app)
        .post(`/api/exchanges/${drawExchangeId}/draw/cancel`)
        .expect(200)

      expect(cancelResponse.body.status).toBe('ready')
      expect(cancelResponse.body.drawAt).toBeFalsy()

      const selfViewResponse = await request(app)
        .get(`/api/p/${drawParticipantToken}`)
        .expect(200)

      expect(selfViewResponse.body.exchange.status).toBe('ready')
      expect(selfViewResponse.body.assignment).toBeFalsy()
    })
  })
})
