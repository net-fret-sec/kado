import type {
  CreateParticipantInputDto,
  CreateParticipantResultDto,
  ParticipantDto,
  ParticipantSelfViewDto,
  UpdateParticipantInputDto,
} from "@kado/shared";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../lib/http-errors";
import {
  formatParticipantAccessCode,
  generateId,
  generateParticipantAccessCode,
  normalizeParticipantAccessCode,
  sha256,
} from "../lib/crypto";
import { participantRepository } from "../repositories/participant.repository";
import { assignmentRepository } from "../repositories/assignment.repository";
import { type DbExecutor, withTransaction } from "../db";
import {
  withExchangeTransaction,
  type ExchangeRecord,
} from "../lib/exchange-transaction";
import { exchangeRepository } from "../repositories/exchange.repository";
import {
  assertNotArchived,
  assertUnchangedFields,
  isExchangeArchived,
  isExchangeDrawn,
} from "../lib/exchange-state";

function participantNotFound(): never {
  throw new NotFoundError("Participant not found.", {
    code: "PARTICIPANT_NOT_FOUND",
  });
}

async function requireParticipant(
  exchangeId: string,
  participantId: string,
  db?: DbExecutor,
) {
  const participant = await participantRepository.findById(
    exchangeId,
    participantId,
    db,
  );
  if (!participant) participantNotFound();
  return participant;
}

async function createAccess(
  exchangeId: string,
  participantId: string,
  db: DbExecutor,
) {
  const token = normalizeParticipantAccessCode(generateParticipantAccessCode());
  await participantRepository.createAccess(
    {
      id: generateId("pacc"),
      exchangeId,
      participantId,
      tokenHash: sha256(token),
      tokenPreview: `XXXX-XXXX-${token.slice(-4)}`,
      status: "active",
      createdAt: new Date().toISOString(),
    },
    db,
  );
  return `/p/${formatParticipantAccessCode(token)}`;
}

// Internal operation: the caller owns the transaction and has locked/just created the exchange.
export async function createParticipantInTransaction(
  exchange: ExchangeRecord,
  input: CreateParticipantInputDto,
  db: DbExecutor,
): Promise<CreateParticipantResultDto> {
  if (isExchangeDrawn(exchange) || isExchangeArchived(exchange)) {
    throw new BadRequestError(
      "Participants cannot be added for this exchange.",
      { code: "PARTICIPANT_CREATION_LOCKED" },
    );
  }
  const now = new Date().toISOString();
  const participant: ParticipantDto = {
    id: generateId("par"),
    exchangeId: exchange.id,
    ...input,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await participantRepository.create(participant, db);
  const accessLink = await createAccess(exchange.id, participant.id, db);
  return { participant, accessLink };
}

export function createParticipant(
  exchangeId: string,
  input: CreateParticipantInputDto,
) {
  return withExchangeTransaction(exchangeId, (exchange, db) =>
    createParticipantInTransaction(exchange, input, db),
  );
}

export function getParticipantsByExchangeId(exchangeId: string) {
  return participantRepository.findByExchangeId(exchangeId);
}

export function getParticipantById(exchangeId: string, participantId: string) {
  return requireParticipant(exchangeId, participantId);
}

function assertParticipantUpdatesAllowed(
  exchange: ExchangeRecord,
  participant: ParticipantDto,
  input: UpdateParticipantInputDto,
) {
  assertNotArchived(exchange);
  if (!isExchangeDrawn(exchange)) return;
  assertUnchangedFields(
    participant,
    input,
    ["name", "email"],
    "PARTICIPANT_IDENTITY_LOCKED",
  );
  if (exchange.lockSuggestionsAfterDraw ?? true) {
    assertUnchangedFields(
      participant,
      input,
      ["wishlist", "note"],
      "PARTICIPANT_SUGGESTIONS_LOCKED",
    );
  }
}

async function applyParticipantUpdate(
  exchange: ExchangeRecord,
  participant: ParticipantDto,
  input: UpdateParticipantInputDto,
  db: DbExecutor,
) {
  assertParticipantUpdatesAllowed(exchange, participant, input);
  const { expectedUpdatedAt, ...updates } = input;
  const updated = expectedUpdatedAt
    ? await participantRepository.updateIfUnchanged(
        exchange.id,
        participant.id,
        updates,
        expectedUpdatedAt,
        db,
      )
    : await participantRepository.update(
        exchange.id,
        participant.id,
        updates,
        db,
      );
  if (!updated) {
    if (expectedUpdatedAt)
      throw new ConflictError("Resource changed. Refresh and try again.", {
        code: "RESOURCE_MODIFIED_CONCURRENTLY",
      });
    participantNotFound();
  }
  return updated;
}

export function updateParticipant(
  exchangeId: string,
  participantId: string,
  input: UpdateParticipantInputDto,
) {
  return withExchangeTransaction(exchangeId, async (exchange, db) => {
    const participant = await requireParticipant(exchangeId, participantId, db);
    return applyParticipantUpdate(exchange, participant, input, db);
  });
}

export function deleteParticipant(
  exchangeId: string,
  participantId: string,
): Promise<void> {
  return withExchangeTransaction(exchangeId, async (exchange, db) => {
    await requireParticipant(exchangeId, participantId, db);
    assertNotArchived(exchange);
    if (isExchangeDrawn(exchange)) {
      throw new BadRequestError(
        "Participants cannot be removed after the draw.",
        { code: "PARTICIPANT_DELETION_LOCKED" },
      );
    }
    if (exchange.organizerId === participantId) {
      await exchangeRepository.update(exchangeId, { organizerId: "" }, db);
    }
    await participantRepository.delete(exchangeId, participantId, db);
  });
}

export function regenerateParticipantAccess(
  exchangeId: string,
  participantId: string,
  revokeExisting = true,
) {
  return withExchangeTransaction(exchangeId, async (_exchange, db) => {
    await requireParticipant(exchangeId, participantId, db);
    if (revokeExisting)
      await participantRepository.revokeActiveAccessForParticipant(
        exchangeId,
        participantId,
        db,
      );
    const accessLink = await createAccess(exchangeId, participantId, db);
    return { participantId, accessLink };
  });
}

function invalidLink(): never {
  throw new NotFoundError("Invalid or expired link.", {
    code: "PARTICIPANT_LINK_INVALID_OR_EXPIRED",
  });
}

async function withParticipantAccess<T>(
  rawToken: string,
  operation: (
    context: {
      access: NonNullable<
        Awaited<
          ReturnType<typeof participantRepository.findActiveAccessByTokenHash>
        >
      >;
      participant: ParticipantDto;
      exchange: ExchangeRecord;
    },
    db: DbExecutor,
  ) => Promise<T>,
): Promise<T> {
  let hash: string;
  try {
    hash = sha256(normalizeParticipantAccessCode(rawToken));
  } catch {
    invalidLink();
  }
  return withTransaction(async (db) => {
    const initial = await participantRepository.findActiveAccessByTokenHash(
      hash,
      db,
    );
    if (!initial) invalidLink();
    const exchange = await exchangeRepository.findByIdForUpdate(
      initial.exchangeId,
      db,
    );
    if (!exchange) invalidLink();
    // Rotation/deletion may have committed while we waited for the parent lock.
    const access = await participantRepository.findActiveAccessByTokenHash(
      hash,
      db,
    );
    if (!access || access.exchangeId !== exchange.id) invalidLink();
    const participant = await participantRepository.findById(
      exchange.id,
      access.participantId,
      db,
    );
    if (!participant || participant.status !== "active") invalidLink();
    const result = await operation({ access, participant, exchange }, db);
    await participantRepository.touchAccess(access.id, db);
    return result;
  });
}

async function selfView(
  exchange: ExchangeRecord,
  participant: ParticipantDto,
  db: DbExecutor,
): Promise<ParticipantSelfViewDto> {
  const assignment = isExchangeDrawn(exchange)
    ? await assignmentRepository.findByExchangeAndGiver(
        exchange.id,
        participant.id,
        db,
      )
    : undefined;
  const receiver = assignment
    ? await participantRepository.findById(
        exchange.id,
        assignment.receiverParticipantId,
        db,
      )
    : undefined;
  return {
    exchange: {
      id: exchange.id,
      name: exchange.name,
      description: exchange.description,
      isDrawn: isExchangeDrawn(exchange),
      isArchived: isExchangeArchived(exchange),
      eventDate: exchange.eventDate,
      budget: exchange.budget,
      minWishlistSuggestions: exchange.minWishlistSuggestions,
      lockSuggestionsAfterDraw: exchange.lockSuggestionsAfterDraw,
    },
    participant: {
      id: participant.id,
      name: participant.name,
      email: participant.email,
      wishlist: participant.wishlist,
      note: participant.note,
      updatedAt: participant.updatedAt,
    },
    assignment: receiver
      ? {
          receiverName: receiver.name,
          receiverWishlist: receiver.wishlist,
          receiverNote: receiver.note,
        }
      : undefined,
  };
}

export function getParticipantSelfViewByToken(rawToken: string) {
  return withParticipantAccess(rawToken, ({ participant, exchange }, db) =>
    selfView(exchange, participant, db),
  );
}

export function updateParticipantSelfByToken(
  rawToken: string,
  input: UpdateParticipantInputDto,
) {
  return withParticipantAccess(
    rawToken,
    async ({ participant, exchange }, db) => {
      const updated = await applyParticipantUpdate(
        exchange,
        participant,
        input,
        db,
      );
      return selfView(exchange, updated, db);
    },
  );
}
