import request from 'supertest'
import { createApp } from '../app'

const app = createApp()

let exchangeId: string
let adminToken: string
let participantId: string
let participantExchangeId: string

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
      adminToken = response.body.adminSessionToken
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
      adminToken = response.body.adminToken
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
          wishlist: 'Updated wishlist'
        })
        .expect(200)

      expect(response.body.name).toBe('Updated Participant')
      expect(response.body.wishlist).toBe('Updated wishlist')
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
})
