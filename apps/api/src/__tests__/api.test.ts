import request from "supertest";
import { createApp } from "../app";
import { exchangeRepository } from "../repositories/exchange.repository";
import { closePool } from "../db";

const app = createApp();

let exchangeId: string;
let participantId: string;
let participantExchangeId: string;
let participantAccessToken: string;
let participantAccessTokenNormalized: string;
let participantUpdatedAt: string;
let participantSelfUpdatedAt: string;
const adminSessionTokens = new Map<string, string>();

function rememberAdminSession(exchangeId: string, token: string) {
  adminSessionTokens.set(exchangeId, token);
}

function requireAdminSessionToken(exchangeId: string): string {
  const token = adminSessionTokens.get(exchangeId);
  if (!token) {
    throw new Error(`Missing admin session token for exchange ${exchangeId}`);
  }
  return token;
}

function asAdmin(exchangeId: string) {
  const authorization = `Bearer ${requireAdminSessionToken(exchangeId)}`;

  return {
    get: (path: string) =>
      request(app).get(path).set("authorization", authorization),
    post: (path: string) =>
      request(app).post(path).set("authorization", authorization),
    put: (path: string) =>
      request(app).put(path).set("authorization", authorization),
    delete: (path: string) =>
      request(app).delete(path).set("authorization", authorization),
  };
}

async function createExchangeWithAdminSession(
  payload: Record<string, unknown>,
) {
  const response = await request(app)
    .post("/api/exchanges")
    .send(payload)
    .expect(201);

  const createdExchangeId = response.body.exchange.id as string;
  const adminSessionToken = response.body.adminSessionToken as string;
  rememberAdminSession(createdExchangeId, adminSessionToken);

  return response;
}

describe("API Tests", () => {
  afterAll(async () => {
    await closePool();
  });

  describe("Exchanges", () => {
    it("should create an exchange", async () => {
      const response = await createExchangeWithAdminSession({
        name: "Test Exchange",
        adminPassword: "testpassword123",
      });

      expect(response.body.exchange).toHaveProperty("id");
      expect(response.body.exchange.name).toBe("Test Exchange");
      expect(response.body).toHaveProperty("adminSessionToken");
      exchangeId = response.body.exchange.id;
    });

    it("should update an exchange", async () => {
      const response = await asAdmin(exchangeId)
        .put(`/api/exchanges/${exchangeId}`)
        .send({
          name: "Updated Exchange",
          description: "Updated description",
        })
        .expect(200);

      expect(response.body.name).toBe("Updated Exchange");
      expect(response.body.description).toBe("Updated description");
    });

    it("should update an exchange with a fresh expectedUpdatedAt", async () => {
      const currentExchange = await asAdmin(exchangeId)
        .get(`/api/exchanges/${exchangeId}`)
        .expect(200);

      const response = await asAdmin(exchangeId)
        .put(`/api/exchanges/${exchangeId}`)
        .send({
          budget: 123,
          expectedUpdatedAt: currentExchange.body.updatedAt,
        })
        .expect(200);

      expect(response.body.budget).toBe(123);
    });

    it("should return 409 when exchange expectedUpdatedAt is stale", async () => {
      const currentExchange = await asAdmin(exchangeId)
        .get(`/api/exchanges/${exchangeId}`)
        .expect(200);

      const staleUpdatedAt = currentExchange.body.updatedAt as string;

      await asAdmin(exchangeId)
        .put(`/api/exchanges/${exchangeId}`)
        .send({
          description: "Concurrent update",
        })
        .expect(200);

      const staleResponse = await asAdmin(exchangeId)
        .put(`/api/exchanges/${exchangeId}`)
        .send({
          name: "Should conflict",
          expectedUpdatedAt: staleUpdatedAt,
        })
        .expect(409);

      expect(staleResponse.body.error.details).toMatchObject({
        code: "RESOURCE_MODIFIED_CONCURRENTLY",
      });
    });

    it("should reject create when suggestions deadline is after exchange moment", async () => {
      const response = await request(app)
        .post("/api/exchanges")
        .send({
          name: "Invalid suggestions deadline on create",
          eventDate: "2026-12-01",
          suggestionsDeadlineAt: "2026-12-02T10:00:00.000Z",
          adminPassword: "testpassword123",
        })
        .expect(400);

      const code = response.body?.error?.details?.code;
      expect([
        "SUGGESTIONS_DEADLINE_AFTER_EXCHANGE_MOMENT",
        "INVALID_REQUEST_BODY",
      ]).toContain(code);
    });

    it("should reject update when suggestions deadline is after exchange moment", async () => {
      const response = await asAdmin(exchangeId)
        .put(`/api/exchanges/${exchangeId}`)
        .send({
          eventDate: "2026-12-01",
          suggestionsDeadlineAt: "2026-12-02T10:00:00.000Z",
        })
        .expect(400);

      const code = response.body?.error?.details?.code;
      expect([
        "SUGGESTIONS_DEADLINE_AFTER_EXCHANGE_MOMENT",
        "INVALID_REQUEST_BODY",
      ]).toContain(code);
    });

    it("should delete an exchange", async () => {
      await asAdmin(exchangeId)
        .delete(`/api/exchanges/${exchangeId}`)
        .expect(204);

      const deletedResponse = await asAdmin(exchangeId).get(
        `/api/exchanges/${exchangeId}`,
      );
      expect([401, 404]).toContain(deletedResponse.status);
    });
  });

  describe("Participants", () => {
    beforeAll(async () => {
      // Create an exchange for participants
      const response = await createExchangeWithAdminSession({
        name: "Test Exchange for Participants",
        adminPassword: "testpassword123",
      });

      participantExchangeId = response.body.exchange.id;
    });

    it("should create a participant", async () => {
      const response = await asAdmin(participantExchangeId)
        .post(`/api/exchanges/${participantExchangeId}/participants`)
        .send({
          name: "Test Participant",
        })
        .expect(201);

      expect(response.body.participant).toHaveProperty("id");
      expect(response.body.participant.name).toBe("Test Participant");
      expect(response.body.accessLink).toMatch(
        /\/p\/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/,
      );
      participantId = response.body.participant.id;
    });

    it("should reject participant creation after draw", async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "Locked participants exchange",
        adminPassword: "testpassword123",
      });

      const lockedExchangeId = exchangeResponse.body.exchange.id;

      await exchangeRepository.update(lockedExchangeId, { status: "drawn" });

      const response = await asAdmin(lockedExchangeId)
        .post(`/api/exchanges/${lockedExchangeId}/participants`)
        .send({ name: "Blocked participant" })
        .expect(400);

      expect(response.body.error.message).toMatch(/cannot be added/i);
      expect(response.body.error.details).toMatchObject({
        code: "PARTICIPANT_CREATION_LOCKED",
      });
    });

    it("should update a participant", async () => {
      const response = await asAdmin(participantExchangeId)
        .put(
          `/api/exchanges/${participantExchangeId}/participants/${participantId}`,
        )
        .send({
          name: "Updated Participant",
          wishlist: [{ title: "Updated wishlist" }],
        })
        .expect(200);

      expect(response.body.name).toBe("Updated Participant");
      expect(response.body.wishlist).toEqual([{ title: "Updated wishlist" }]);
      participantUpdatedAt = response.body.updatedAt;
    });

    it("should return 409 when participant expectedUpdatedAt is stale", async () => {
      await asAdmin(participantExchangeId)
        .put(
          `/api/exchanges/${participantExchangeId}/participants/${participantId}`,
        )
        .send({
          note: "Concurrent participant update",
        })
        .expect(200);

      const staleResponse = await asAdmin(participantExchangeId)
        .put(
          `/api/exchanges/${participantExchangeId}/participants/${participantId}`,
        )
        .send({
          name: "Should conflict",
          expectedUpdatedAt: participantUpdatedAt,
        })
        .expect(409);

      expect(staleResponse.body.error.details).toMatchObject({
        code: "RESOURCE_MODIFIED_CONCURRENTLY",
      });
    });

    it("should delete a participant", async () => {
      await asAdmin(participantExchangeId)
        .delete(
          `/api/exchanges/${participantExchangeId}/participants/${participantId}`,
        )
        .expect(204);

      // Verify it's deleted
      await asAdmin(participantExchangeId)
        .get(`/api/exchanges/${participantExchangeId}/participants`)
        .expect(200)
        .then((res) => {
          expect(res.body.length).toBe(0);
        });
    });
  });

  describe("Public participant access", () => {
    beforeAll(async () => {
      const response = await asAdmin(participantExchangeId)
        .post(`/api/exchanges/${participantExchangeId}/participants`)
        .send({ name: "Public Participant" })
        .expect(201);

      const accessLink = response.body.accessLink as string;
      participantAccessToken = new URL(accessLink).pathname
        .split("/")
        .pop() as string;
      participantAccessTokenNormalized = participantAccessToken
        .toUpperCase()
        .replace(/[\s-]/g, "");

      expect(participantAccessToken).toMatch(
        /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/,
      );
      expect(participantAccessTokenNormalized).toMatch(/^[A-Z2-9]{12}$/);
    });

    it("should fetch self view by token", async () => {
      const response = await request(app)
        .get(`/api/p/${participantAccessToken}`)
        .expect(200);

      expect(response.body.exchange.id).toBe(participantExchangeId);
      expect(response.body.participant.name).toBe("Public Participant");
      participantSelfUpdatedAt = response.body.participant.updatedAt;
    });

    it("should accept lowercase and separators variations for token", async () => {
      const compactLowercase = participantAccessTokenNormalized.toLowerCase();
      const spaced = `${compactLowercase.slice(0, 4)} ${compactLowercase.slice(4, 8)} ${compactLowercase.slice(8, 12)}`;

      const response = await request(app)
        .get(`/api/p/${encodeURIComponent(spaced)}`)
        .expect(200);

      expect(response.body.exchange.id).toBe(participantExchangeId);
      expect(response.body.participant.name).toBe("Public Participant");
    });

    it("should return the same error for invalid format and unknown token", async () => {
      const invalidFormatResponse = await request(app)
        .get("/api/p/not-a-valid-token")
        .expect(404);

      const unknownTokenResponse = await request(app)
        .get("/api/p/ABCD-EFGH-JKLM")
        .expect(404);

      expect(invalidFormatResponse.body.error).toEqual(
        unknownTokenResponse.body.error,
      );
      expect(invalidFormatResponse.body.error.details).toMatchObject({
        code: "PARTICIPANT_LINK_INVALID_OR_EXPIRED",
      });
    });

    it("should update participant info by token before draw", async () => {
      const response = await request(app)
        .put(`/api/p/${participantAccessToken}`)
        .send({
          name: "Participant Public Edit",
          email: "participant@example.com",
          note: "Aucune arachide svp",
          wishlist: [
            { title: "Livre de cuisine", linkUrl: "https://example.com/livre" },
            { title: "Chaussettes en laine" },
          ],
        })
        .expect(200);

      expect(response.body.participant.name).toBe("Participant Public Edit");
      expect(response.body.participant.email).toBe("participant@example.com");
      expect(response.body.participant.wishlist).toHaveLength(2);

      participantSelfUpdatedAt = response.body.participant.updatedAt;
    });

    it("should return 409 when participant self expectedUpdatedAt is stale", async () => {
      await request(app)
        .put(`/api/p/${participantAccessToken}`)
        .send({
          note: "Concurrent self update",
        })
        .expect(200);

      const staleResponse = await request(app)
        .put(`/api/p/${participantAccessToken}`)
        .send({
          name: "Self conflict",
          expectedUpdatedAt: participantSelfUpdatedAt,
        })
        .expect(409);

      expect(staleResponse.body.error.details).toMatchObject({
        code: "RESOURCE_MODIFIED_CONCURRENTLY",
      });
    });

    it("should reject participant update after draw when lock after draw is enabled", async () => {
      await exchangeRepository.update(participantExchangeId, {
        status: "drawn",
        lockSuggestionsAfterDraw: true,
      });

      const response = await request(app)
        .put(`/api/p/${participantAccessToken}`)
        .send({ name: "Blocked update" })
        .expect(400);

      expect(response.body.error.message).toMatch(
        /suggestions updates are closed/i,
      );
      expect(response.body.error.details).toMatchObject({
        code: "PARTICIPANT_SUGGESTIONS_LOCKED",
      });
    });

    it("should allow participant update after draw when lock after draw is disabled", async () => {
      await exchangeRepository.update(participantExchangeId, {
        status: "drawn",
        lockSuggestionsAfterDraw: false,
        suggestionsDeadlineAt: undefined,
      });

      const response = await request(app)
        .put(`/api/p/${participantAccessToken}`)
        .send({
          name: "Allowed after draw",
          wishlist: [{ title: "Nouvelle suggestion" }],
        })
        .expect(200);

      expect(response.body.participant.name).toBe("Allowed after draw");
      expect(response.body.participant.wishlist).toEqual([
        { title: "Nouvelle suggestion" },
      ]);
    });

    it("should reject participant update when suggestions deadline is passed", async () => {
      await exchangeRepository.update(participantExchangeId, {
        status: "drawn",
        lockSuggestionsAfterDraw: false,
        suggestionsDeadlineAt: "2000-01-01T00:00:00.000Z",
      });

      const response = await request(app)
        .put(`/api/p/${participantAccessToken}`)
        .send({ name: "Blocked update" })
        .expect(400);

      expect(response.body.error.message).toMatch(
        /suggestions updates are closed/i,
      );
      expect(response.body.error.details).toMatchObject({
        code: "PARTICIPANT_SUGGESTIONS_LOCKED",
      });
    });
  });

  describe("Draw mechanism", () => {
    let drawExchangeId: string;
    let drawParticipantToken: string;

    beforeAll(async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "Draw Ready Exchange",
        adminPassword: "testpassword123",
      });

      drawExchangeId = exchangeResponse.body.exchange.id;

      const p1 = await asAdmin(drawExchangeId)
        .post(`/api/exchanges/${drawExchangeId}/participants`)
        .send({ name: "Anna", wishlist: [{ title: "Livre" }] })
        .expect(201);

      await asAdmin(drawExchangeId)
        .post(`/api/exchanges/${drawExchangeId}/participants`)
        .send({ name: "Ben", wishlist: [{ title: "Jeu" }] })
        .expect(201);

      await asAdmin(drawExchangeId)
        .post(`/api/exchanges/${drawExchangeId}/participants`)
        .send({ name: "Chloe", wishlist: [{ title: "Puzzle" }] })
        .expect(201);

      drawParticipantToken = new URL(p1.body.accessLink).pathname
        .split("/")
        .pop() as string;
    });

    it("should trigger draw and set exchange status to drawn", async () => {
      const response = await asAdmin(drawExchangeId)
        .post(`/api/exchanges/${drawExchangeId}/draw`)
        .expect(200);

      expect(response.body.status).toBe("drawn");
      expect(response.body.drawAt).toBeTruthy();
    });

    it("should expose assignment in participant self view after draw", async () => {
      const response = await request(app)
        .get(`/api/p/${drawParticipantToken}`)
        .expect(200);

      expect(response.body.exchange.status).toBe("drawn");
      expect(response.body.assignment).toBeTruthy();
      expect(response.body.assignment.receiverName).toBeTruthy();
    });

    it("should reject draw when exchange has less than 3 participants", async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "Not enough participants",
        adminPassword: "testpassword123",
      });

      const exchangeId = exchangeResponse.body.exchange.id;

      await asAdmin(exchangeId)
        .post(`/api/exchanges/${exchangeId}/participants`)
        .send({ name: "Solo" })
        .expect(201);

      const response = await asAdmin(exchangeId)
        .post(`/api/exchanges/${exchangeId}/draw`)
        .expect(400);

      expect(response.body.error.message).toMatch(
        /at least 3 active participants/i,
      );
      expect(response.body.error.details).toMatchObject({
        code: "DRAW_MIN_ACTIVE_PARTICIPANTS",
      });
    });

    it("should cancel draw and reopen exchange state", async () => {
      const cancelResponse = await asAdmin(drawExchangeId)
        .post(`/api/exchanges/${drawExchangeId}/draw/cancel`)
        .expect(200);

      expect(cancelResponse.body.status).toBe("ready");
      expect(cancelResponse.body.drawAt).toBeFalsy();

      const selfViewResponse = await request(app)
        .get(`/api/p/${drawParticipantToken}`)
        .expect(200);

      expect(selfViewResponse.body.exchange.status).toBe("ready");
      expect(selfViewResponse.body.assignment).toBeFalsy();
    });

    it("should respect exclusion rules during draw", async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "Exclusion-aware draw",
        adminPassword: "testpassword123",
      });

      const exclusionAwareExchangeId = exchangeResponse.body.exchange.id;

      const annaResponse = await asAdmin(exclusionAwareExchangeId)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/participants`)
        .send({ name: "Anna" })
        .expect(201);

      const benResponse = await asAdmin(exclusionAwareExchangeId)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/participants`)
        .send({ name: "Ben" })
        .expect(201);

      await asAdmin(exclusionAwareExchangeId)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/participants`)
        .send({ name: "Chloe" })
        .expect(201);

      await asAdmin(exclusionAwareExchangeId)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/exclusions`)
        .send({
          giverParticipantId: annaResponse.body.participant.id,
          receiverParticipantId: benResponse.body.participant.id,
        })
        .expect(201);

      await asAdmin(exclusionAwareExchangeId)
        .post(`/api/exchanges/${exclusionAwareExchangeId}/draw`)
        .expect(200);

      const annaToken = new URL(annaResponse.body.accessLink).pathname
        .split("/")
        .pop() as string;
      const annaSelfView = await request(app)
        .get(`/api/p/${annaToken}`)
        .expect(200);

      expect(annaSelfView.body.assignment.receiverName).not.toBe("Ben");
    });

    it("should reject draw when exclusion rules make assignments impossible", async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "Impossible exclusion draw",
        adminPassword: "testpassword123",
      });

      const impossibleExchangeId = exchangeResponse.body.exchange.id;

      const p1Response = await asAdmin(impossibleExchangeId)
        .post(`/api/exchanges/${impossibleExchangeId}/participants`)
        .send({ name: "Ariane" })
        .expect(201);

      const p2Response = await asAdmin(impossibleExchangeId)
        .post(`/api/exchanges/${impossibleExchangeId}/participants`)
        .send({ name: "Bruno" })
        .expect(201);

      const p3Response = await asAdmin(impossibleExchangeId)
        .post(`/api/exchanges/${impossibleExchangeId}/participants`)
        .send({ name: "Clara" })
        .expect(201);

      await asAdmin(impossibleExchangeId)
        .post(`/api/exchanges/${impossibleExchangeId}/exclusions`)
        .send({
          giverParticipantId: p1Response.body.participant.id,
          receiverParticipantId: p2Response.body.participant.id,
        })
        .expect(201);

      await asAdmin(impossibleExchangeId)
        .post(`/api/exchanges/${impossibleExchangeId}/exclusions`)
        .send({
          giverParticipantId: p1Response.body.participant.id,
          receiverParticipantId: p3Response.body.participant.id,
        })
        .expect(201);

      await asAdmin(impossibleExchangeId)
        .post(`/api/exchanges/${impossibleExchangeId}/exclusions`)
        .send({
          giverParticipantId: p2Response.body.participant.id,
          receiverParticipantId: p1Response.body.participant.id,
        })
        .expect(201);

      const drawResponse = await asAdmin(impossibleExchangeId)
        .post(`/api/exchanges/${impossibleExchangeId}/draw`)
        .expect(400);

      expect(drawResponse.body.error.message).toMatch(
        /no valid draw is possible/i,
      );
      expect(drawResponse.body.error.details).toMatchObject({
        code: "DRAW_IMPOSSIBLE",
      });
    });

    it("should reject draw with 2 participants when no mutual assignments is enabled", async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "No mutual with 2 participants",
        adminPassword: "testpassword123",
        noMutualAssignments: true,
      });

      const noMutualExchangeId = exchangeResponse.body.exchange.id;

      await asAdmin(noMutualExchangeId)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: "Alice" })
        .expect(201);

      await asAdmin(noMutualExchangeId)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: "Bob" })
        .expect(201);

      const drawResponse = await asAdmin(noMutualExchangeId)
        .post(`/api/exchanges/${noMutualExchangeId}/draw`)
        .expect(400);

      expect(drawResponse.body.error.message).toMatch(
        /at least 3 active participants/i,
      );
      expect(drawResponse.body.error.details).toMatchObject({
        code: "DRAW_MIN_ACTIVE_PARTICIPANTS",
      });
    });

    it("should allow draw with 3 participants when no mutual assignments is enabled", async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "No mutual with 3 participants",
        adminPassword: "testpassword123",
        noMutualAssignments: true,
      });

      const noMutualExchangeId = exchangeResponse.body.exchange.id;

      await asAdmin(noMutualExchangeId)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: "Alice" })
        .expect(201);

      await asAdmin(noMutualExchangeId)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: "Bob" })
        .expect(201);

      await asAdmin(noMutualExchangeId)
        .post(`/api/exchanges/${noMutualExchangeId}/participants`)
        .send({ name: "Charlie" })
        .expect(201);

      const drawResponse = await asAdmin(noMutualExchangeId)
        .post(`/api/exchanges/${noMutualExchangeId}/draw`)
        .expect(200);

      expect(drawResponse.body.status).toBe("drawn");
    });

    it("should reject draw when deadline is passed", async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "Past deadline exchange",
        adminPassword: "testpassword123",
        drawDeadlineAt: "2000-01-01T00:00:00.000Z",
      });

      const deadlineExchangeId = exchangeResponse.body.exchange.id;

      await asAdmin(deadlineExchangeId)
        .post(`/api/exchanges/${deadlineExchangeId}/participants`)
        .send({ name: "Ari" })
        .expect(201);

      await asAdmin(deadlineExchangeId)
        .post(`/api/exchanges/${deadlineExchangeId}/participants`)
        .send({ name: "Bri" })
        .expect(201);

      await asAdmin(deadlineExchangeId)
        .post(`/api/exchanges/${deadlineExchangeId}/participants`)
        .send({ name: "Cri" })
        .expect(201);

      const drawResponse = await asAdmin(deadlineExchangeId)
        .post(`/api/exchanges/${deadlineExchangeId}/draw`)
        .expect(400);

      expect(drawResponse.body.error.details).toMatchObject({
        code: "DRAW_DEADLINE_PASSED",
      });
    });

    it("should reject draw when participants do not meet minimum wishlist suggestions", async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "Min wishlist exchange",
        adminPassword: "testpassword123",
        minWishlistSuggestions: 2,
      });

      const minWishlistExchangeId = exchangeResponse.body.exchange.id;

      await asAdmin(minWishlistExchangeId)
        .post(`/api/exchanges/${minWishlistExchangeId}/participants`)
        .send({
          name: "Ari",
          wishlist: [{ title: "Livre" }],
        })
        .expect(201);

      await asAdmin(minWishlistExchangeId)
        .post(`/api/exchanges/${minWishlistExchangeId}/participants`)
        .send({
          name: "Bri",
          wishlist: [{ title: "Chandail" }, { title: "Bas de laine" }],
        })
        .expect(201);

      await asAdmin(minWishlistExchangeId)
        .post(`/api/exchanges/${minWishlistExchangeId}/participants`)
        .send({
          name: "Cri",
          wishlist: [{ title: "Carte-cadeau" }, { title: "Mug" }],
        })
        .expect(201);

      const drawResponse = await asAdmin(minWishlistExchangeId)
        .post(`/api/exchanges/${minWishlistExchangeId}/draw`)
        .expect(400);

      expect(drawResponse.body.error.details).toMatchObject({
        code: "DRAW_MIN_WISHLIST_SUGGESTIONS",
        minWishlistSuggestions: 2,
      });
      expect(
        drawResponse.body.error.details.participantsMissingSuggestions,
      ).toHaveLength(1);
    });

    it("should prioritize minimum active participants over wishlist minimum when both fail", async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "Participants priority over wishlist",
        adminPassword: "testpassword123",
        minWishlistSuggestions: 2,
      });

      const priorityExchangeId = exchangeResponse.body.exchange.id;

      await asAdmin(priorityExchangeId)
        .post(`/api/exchanges/${priorityExchangeId}/participants`)
        .send({
          name: "Ari",
          wishlist: [{ title: "Livre" }],
        })
        .expect(201);

      await asAdmin(priorityExchangeId)
        .post(`/api/exchanges/${priorityExchangeId}/participants`)
        .send({
          name: "Bri",
          wishlist: [{ title: "Jeu" }],
        })
        .expect(201);

      const drawResponse = await asAdmin(priorityExchangeId)
        .post(`/api/exchanges/${priorityExchangeId}/draw`)
        .expect(400);

      expect(drawResponse.body.error.details).toMatchObject({
        code: "DRAW_MIN_ACTIVE_PARTICIPANTS",
      });
    });
  });

  describe("Exclusion rules", () => {
    let exclusionExchangeId: string;
    let p1Id: string;
    let p2Id: string;
    let otherExchangeParticipantId: string;
    let createdRuleId: string;

    beforeAll(async () => {
      const exchangeResponse = await createExchangeWithAdminSession({
        name: "Exchange with exclusions",
        adminPassword: "testpassword123",
      });

      exclusionExchangeId = exchangeResponse.body.exchange.id;

      const p1Response = await asAdmin(exclusionExchangeId)
        .post(`/api/exchanges/${exclusionExchangeId}/participants`)
        .send({ name: "Alex" })
        .expect(201);

      p1Id = p1Response.body.participant.id;

      const p2Response = await asAdmin(exclusionExchangeId)
        .post(`/api/exchanges/${exclusionExchangeId}/participants`)
        .send({ name: "Camille" })
        .expect(201);

      p2Id = p2Response.body.participant.id;

      const otherExchangeResponse = await createExchangeWithAdminSession({
        name: "Other exchange for validation",
        adminPassword: "testpassword123",
      });

      const otherExchangeId = otherExchangeResponse.body.exchange.id as string;

      const otherParticipantResponse = await asAdmin(otherExchangeId)
        .post(`/api/exchanges/${otherExchangeId}/participants`)
        .send({ name: "Outside Participant" })
        .expect(201);

      otherExchangeParticipantId = otherParticipantResponse.body.participant.id;
    });

    it("should create and list exclusion rules", async () => {
      const createResponse = await asAdmin(exclusionExchangeId)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({ giverParticipantId: p1Id, receiverParticipantId: p2Id })
        .expect(201);

      expect(createResponse.body).toHaveProperty("id");
      expect(createResponse.body.giverParticipantId).toBe(p1Id);
      expect(createResponse.body.receiverParticipantId).toBe(p2Id);
      expect(createResponse.body.type).toBe("manual");

      createdRuleId = createResponse.body.id;

      const listResponse = await asAdmin(exclusionExchangeId)
        .get(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .expect(200);

      expect(listResponse.body).toHaveLength(1);
      expect(listResponse.body[0].id).toBe(createdRuleId);
    });

    it("should reject self exclusion", async () => {
      const response = await asAdmin(exclusionExchangeId)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({ giverParticipantId: p1Id, receiverParticipantId: p1Id })
        .expect(400);

      expect(response.body.error.message).toMatch(
        /cannot be excluded from drawing themselves/i,
      );
      expect(response.body.error.details).toMatchObject({
        code: "EXCLUSION_SELF_NOT_ALLOWED",
      });
    });

    it("should reject duplicate exclusion rule", async () => {
      const response = await asAdmin(exclusionExchangeId)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({ giverParticipantId: p1Id, receiverParticipantId: p2Id })
        .expect(400);

      expect(response.body.error.message).toMatch(/already exists/i);
      expect(response.body.error.details).toMatchObject({
        code: "EXCLUSION_RULE_ALREADY_EXISTS",
      });
    });

    it("should reject exclusion rule when participant is outside exchange", async () => {
      const response = await asAdmin(exclusionExchangeId)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({
          giverParticipantId: p1Id,
          receiverParticipantId: otherExchangeParticipantId,
        })
        .expect(400);

      expect(response.body.error.message).toMatch(
        /does not belong to this exchange/i,
      );
      expect(response.body.error.details).toMatchObject({
        code: "PARTICIPANT_OUTSIDE_EXCHANGE",
      });
    });

    it("should delete exclusion rule", async () => {
      await asAdmin(exclusionExchangeId)
        .delete(
          `/api/exchanges/${exclusionExchangeId}/exclusions/${createdRuleId}`,
        )
        .expect(204);

      const listResponse = await asAdmin(exclusionExchangeId)
        .get(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .expect(200);

      expect(listResponse.body).toHaveLength(0);
    });

    it("should reject exclusion changes after draw", async () => {
      await exchangeRepository.update(exclusionExchangeId, { status: "drawn" });

      const createResponse = await asAdmin(exclusionExchangeId)
        .post(`/api/exchanges/${exclusionExchangeId}/exclusions`)
        .send({ giverParticipantId: p2Id, receiverParticipantId: p1Id })
        .expect(400);

      expect(createResponse.body.error.message).toMatch(/cannot be modified/i);
      expect(createResponse.body.error.details).toMatchObject({
        code: "EXCLUSION_RULES_LOCKED",
      });

      const deleteResponse = await asAdmin(exclusionExchangeId)
        .delete(
          `/api/exchanges/${exclusionExchangeId}/exclusions/non-existent-rule`,
        )
        .expect(400);

      expect(deleteResponse.body.error.message).toMatch(/cannot be modified/i);
      expect(deleteResponse.body.error.details).toMatchObject({
        code: "EXCLUSION_RULES_LOCKED",
      });
    });
  });
});
