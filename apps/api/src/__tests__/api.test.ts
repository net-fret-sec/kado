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
      expect(response.body.error.details).toMatchObject({
        code: 'PARTICIPANT_UPDATES_CLOSED',
      })
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

      await request(app)
        .post(`/api/exchanges/${drawExchangeId}/participants`)
        .send({ name: 'Chloe', wishlist: [{ title: 'Puzzle' }] })
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

    it('should reject draw when exchange has less than 3 participants', async () => {
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

      expect(response.body.error.message).toMatch(/at least 3 active participants/i)
      expect(response.body.error.details).toMatchObject({
        code: 'DRAW_MIN_ACTIVE_PARTICIPANTS',
      })
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

    it('should respect exclusion rules during draw', async () => {
      const exchangeResponse = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'Exclusion-aware draw',
          adminPassword: 'testpassword123',
        })
        .expect(201)

      const exclusionAwareExchangeId = exchangeResponse.body.exchange.id

      const annaResponse = await request(app)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/participants`)
        .send({ name: 'Anna' })
        .expect(201)

      const benResponse = await request(app)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/participants`)
        .send({ name: 'Ben' })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/participants`)
        .send({ name: 'Chloe' })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/exclusions`)
        .send({
          giverParticipantId: annaResponse.body.participant.id,
          receiverParticipantId: benResponse.body.participant.id,
        })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/draw`)
        .expect(200)

      const annaToken = new URL(annaResponse.body.accessLink).pathname.split('/').pop() as string
      const annaSelfView = await request(app)
        .get(`/api/p/${annaToken}`)
        .expect(200)

      expect(annaSelfView.body.assignment.receiverName).not.toBe('Ben')
    })

    it('should reject draw when exclusion rules make assignments impossible', async () => {
      const exchangeResponse = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'Impossible exclusion draw',
          adminPassword: 'testpassword123',
        })
        .expect(201)

      const impossibleExchangeId = exchangeResponse.body.exchange.id

      const p1Response = await request(app)
        .post(`/api/exchanges/${impossibleExchangeId}/participants`)
        .send({ name: 'Ariane' })
        .expect(201)

      const p2Response = await request(app)
        .post(`/api/exchanges/${impossibleExchangeId}/participants`)
        .send({ name: 'Bruno' })
        .expect(201)

      const p3Response = await request(app)
        .post(`/api/exchanges/${impossibleExchangeId}/participants`)
        .send({ name: 'Clara' })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${impossibleExchangeId}/exclusions`)
        .send({
          giverParticipantId: p1Response.body.participant.id,
          receiverParticipantId: p2Response.body.participant.id,
        })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${impossibleExchangeId}/exclusions`)
        .send({
          giverParticipantId: p1Response.body.participant.id,
          receiverParticipantId: p3Response.body.participant.id,
        })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${impossibleExchangeId}/exclusions`)
        .send({
          giverParticipantId: p2Response.body.participant.id,
          receiverParticipantId: p1Response.body.participant.id,
        })
        .expect(201)

      const drawResponse = await request(app)
        .post(`/api/exchanges/${impossibleExchangeId}/draw`)
        .expect(400)

      expect(drawResponse.body.error.message).toMatch(/no valid draw is possible/i)
      expect(drawResponse.body.error.details).toMatchObject({
        code: 'DRAW_IMPOSSIBLE',
      })
    })

    it('should reject draw with 2 participants when no mutual assignments is enabled', async () => {
      const exchangeResponse = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'No mutual with 2 participants',
          adminPassword: 'testpassword123',
          noMutualAssignments: true,
        })
        .expect(201)

      const noMutualExchangeId = exchangeResponse.body.exchange.id

      await request(app)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: 'Alice' })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: 'Bob' })
        .expect(201)

      const drawResponse = await request(app)
        .post(`/api/exchanges/${noMutualExchangeId}/draw`)
        .expect(400)

      expect(drawResponse.body.error.message).toMatch(/at least 3 active participants/i)
      expect(drawResponse.body.error.details).toMatchObject({
        code: 'DRAW_MIN_ACTIVE_PARTICIPANTS',
      })
    })

    it('should allow draw with 3 participants when no mutual assignments is enabled', async () => {
      const exchangeResponse = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'No mutual with 3 participants',
          adminPassword: 'testpassword123',
          noMutualAssignments: true,
        })
        .expect(201)

      const noMutualExchangeId = exchangeResponse.body.exchange.id

      await request(app)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: 'Alice' })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: 'Bob' })
        .expect(201)

      await request(app)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: 'Charlie' })
        .expect(201)

      const drawResponse = await request(app)
        .post(`/api/exchanges/${noMutualExchangeId}/draw`)
        .expect(200)

      expect(drawResponse.body.status).toBe('drawn')
    })
  })

  describe('Exclusion rules', () => {
    let exclusionExchangeId: string
    let p1Id: string
    let p2Id: string
    let otherExchangeParticipantId: string
    let createdRuleId: string

    beforeAll(async () => {
      const exchangeResponse = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'Exchange with exclusions',
          adminPassword: 'testpassword123',
        })
        .expect(201)

      exclusionExchangeId = exchangeResponse.body.exchange.id

      const p1Response = await request(app)
        .post(`/api/exchanges/${exclusionExchangeId}/participants`)
        .send({ name: 'Alex' })
        .expect(201)

      p1Id = p1Response.body.participant.id

      const p2Response = await request(app)
        .post(`/api/exchanges/${exclusionExchangeId}/participants`)
        .send({ name: 'Camille' })
        .expect(201)

      p2Id = p2Response.body.participant.id

      const otherExchangeResponse = await request(app)
        .post('/api/exchanges')
        .send({
          name: 'Other exchange for validation',
          adminPassword: 'testpassword123',
        })
        .expect(201)

      const otherParticipantResponse = await request(app)
        .post(`/api/exchanges/${otherExchangeResponse.body.exchange.id}/participants`)
        .send({ name: 'Outside Participant' })
        .expect(201)

      otherExchangeParticipantId = otherParticipantResponse.body.participant.id
    })

    it('should create and list exclusion rules', async () => {
      const createResponse = await request(app)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({ giverParticipantId: p1Id, receiverParticipantId: p2Id })
        .expect(201)

      expect(createResponse.body).toHaveProperty('id')
      expect(createResponse.body.giverParticipantId).toBe(p1Id)
      expect(createResponse.body.receiverParticipantId).toBe(p2Id)
      expect(createResponse.body.type).toBe('manual')

      createdRuleId = createResponse.body.id

      const listResponse = await request(app)
        .get(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .expect(200)

      expect(listResponse.body).toHaveLength(1)
      expect(listResponse.body[0].id).toBe(createdRuleId)
    })

    it('should reject self exclusion', async () => {
      const response = await request(app)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({ giverParticipantId: p1Id, receiverParticipantId: p1Id })
        .expect(400)

      expect(response.body.error.message).toMatch(/cannot be excluded from drawing themselves/i)
      expect(response.body.error.details).toMatchObject({
        code: 'EXCLUSION_SELF_NOT_ALLOWED',
      })
    })

    it('should reject duplicate exclusion rule', async () => {
      const response = await request(app)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({ giverParticipantId: p1Id, receiverParticipantId: p2Id })
        .expect(400)

      expect(response.body.error.message).toMatch(/already exists/i)
      expect(response.body.error.details).toMatchObject({
        code: 'EXCLUSION_RULE_ALREADY_EXISTS',
      })
    })

    it('should reject exclusion rule when participant is outside exchange', async () => {
      const response = await request(app)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({ giverParticipantId: p1Id, receiverParticipantId: otherExchangeParticipantId })
        .expect(400)

      expect(response.body.error.message).toMatch(/does not belong to this exchange/i)
      expect(response.body.error.details).toMatchObject({
        code: 'PARTICIPANT_OUTSIDE_EXCHANGE',
      })
    })

    it('should delete exclusion rule', async () => {
      await request(app)
        .delete(`/api/exchanges/${exclusionExchangeId}/exclusions/${createdRuleId}`)
        .expect(204)

      const listResponse = await request(app)
        .get(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .expect(200)

      expect(listResponse.body).toHaveLength(0)
    })

    it('should reject exclusion changes after draw', async () => {
      exchangeRepository.update(exclusionExchangeId, { status: 'drawn' })

      const createResponse = await request(app)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({ giverParticipantId: p2Id, receiverParticipantId: p1Id })
        .expect(400)

      expect(createResponse.body.error.message).toMatch(/cannot be modified/i)
      expect(createResponse.body.error.details).toMatchObject({
        code: 'EXCLUSION_RULES_LOCKED',
      })

      const deleteResponse = await request(app)
        .delete(`/api/exchanges/${exclusionExchangeId}/exclusions/non-existent-rule`)
        .expect(400)

      expect(deleteResponse.body.error.message).toMatch(/cannot be modified/i)
      expect(deleteResponse.body.error.details).toMatchObject({
        code: 'EXCLUSION_RULES_LOCKED',
      })
    })
  })
})
