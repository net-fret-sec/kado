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
import { exchangeRepository } from "../repositories/exchange.repository";
import { participantRepository } from "../repositories/participant.repository";
import { assignmentRepository } from "../repositories/assignment.repository";

function areParticipantSuggestionsUpdatesClosed(exchange: {
  drawAt?: string;
  eventDate?: string;
  lockSuggestionsAfterDraw?: boolean;
}) {
  if (isExchangeArchived(exchange)) {
    return true;
  }

  const lockAfterDraw = exchange.lockSuggestionsAfterDraw ?? true;
  if (isExchangeDrawn(exchange) && lockAfterDraw) {
    return true;
  }

  return false;
}

function isExchangeDrawn(exchange: { drawAt?: string }) {
  return Boolean(exchange.drawAt);
}

function isExchangeArchived(exchange: { eventDate?: string }) {
  if (!exchange.eventDate) {
    return false;
  }

  const eventLocalEnd = new Date(`${exchange.eventDate}T23:59:59.999`);
  if (Number.isNaN(eventLocalEnd.getTime())) {
    return false;
  }

  const archiveAt = eventLocalEnd.getTime() + 30 * 24 * 60 * 60 * 1000;
  return Date.now() > archiveAt;
}

export async function createParticipant(
  exchangeId: string,
  input: CreateParticipantInputDto,
): Promise<CreateParticipantResultDto> {
  const exchange = await exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  if (isExchangeDrawn(exchange) || isExchangeArchived(exchange)) {
    throw new BadRequestError(
      "Participants cannot be added for this exchange.",
      {
        code: "PARTICIPANT_CREATION_LOCKED",
      },
    );
  }

  const now = new Date().toISOString();

  const participant: ParticipantDto = {
    id: generateId("par"),
    exchangeId,
    name: input.name,
    email: input.email,
    wishlist: input.wishlist,
    note: input.note,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  await participantRepository.create(participant);

  const accessCode = generateParticipantAccessCode();
  const normalizedAccessCode = normalizeParticipantAccessCode(accessCode);
  const groupedAccessCode = formatParticipantAccessCode(normalizedAccessCode);

  await participantRepository.createAccess({
    id: generateId("pacc"),
    exchangeId,
    participantId: participant.id,
    tokenHash: sha256(normalizedAccessCode),
    tokenPreview: `XXXX-XXXX-${normalizedAccessCode.slice(-4)}`,
    status: "active",
    createdAt: now,
  });

  return {
    participant,
    accessLink: `/p/${groupedAccessCode}`,
  };
}

export async function getParticipantsByExchangeId(exchangeId: string) {
  return await participantRepository.findByExchangeId(exchangeId);
}

export async function getParticipantById(
  participantId: string,
): Promise<ParticipantDto> {
  const participant = await participantRepository.findById(participantId);

  if (!participant) {
    throw new NotFoundError("Participant not found.", {
      code: "PARTICIPANT_NOT_FOUND",
    });
  }

  return participant;
}

export async function updateParticipant(
  participantId: string,
  input: UpdateParticipantInputDto,
): Promise<ParticipantDto> {
  const participant = await participantRepository.findById(participantId);

  if (!participant) {
    throw new NotFoundError("Participant not found.", {
      code: "PARTICIPANT_NOT_FOUND",
    });
  }

  const { expectedUpdatedAt, ...updates } = input;

  const updated = expectedUpdatedAt
    ? await participantRepository.updateIfUnchanged(
        participantId,
        updates,
        expectedUpdatedAt,
      )
    : await participantRepository.update(participantId, updates);

  if (!updated) {
    if (expectedUpdatedAt) {
      throw new ConflictError(
        "Participant was modified by another user. Refresh and try again.",
        {
          code: "RESOURCE_MODIFIED_CONCURRENTLY",
        },
      );
    }

    throw new NotFoundError("Participant not found.", {
      code: "PARTICIPANT_NOT_FOUND",
    });
  }

  return updated;
}

export async function deleteParticipant(participantId: string): Promise<void> {
  const participant = await participantRepository.findById(participantId);

  if (!participant) {
    throw new NotFoundError("Participant not found.", {
      code: "PARTICIPANT_NOT_FOUND",
    });
  }

  await participantRepository.delete(participantId);
}

export async function regenerateParticipantAccess(
  participantId: string,
  revokeExisting: boolean = true,
): Promise<{ participantId: string; accessLink: string }> {
  const participant = await participantRepository.findById(participantId);
  if (!participant) {
    throw new NotFoundError("Participant not found.", {
      code: "PARTICIPANT_NOT_FOUND",
    });
  }

  const now = new Date().toISOString();
  const accessCode = generateParticipantAccessCode();
  const normalizedAccessCode = normalizeParticipantAccessCode(accessCode);
  const groupedAccessCode = formatParticipantAccessCode(normalizedAccessCode);

  if (revokeExisting) {
    await participantRepository.revokeActiveAccessForParticipant(participantId);
  }

  await participantRepository.createAccess({
    id: generateId("pacc"),
    exchangeId: participant.exchangeId,
    participantId: participant.id,
    tokenHash: sha256(normalizedAccessCode),
    tokenPreview: `XXXX-XXXX-${normalizedAccessCode.slice(-4)}`,
    status: "active",
    createdAt: now,
  });

  return {
    participantId: participant.id,
    accessLink: `/p/${groupedAccessCode}`,
  };
}

export async function getParticipantSelfViewByToken(
  rawToken: string,
): Promise<ParticipantSelfViewDto> {
  const { access, participant, exchange } =
    await resolveParticipantAccess(rawToken);

  await participantRepository.touchAccess(access.id);

  const assignment = isExchangeDrawn(exchange)
    ? await assignmentRepository.findByExchangeAndGiver(
        exchange.id,
        participant.id,
      )
    : undefined;

  const receiver = assignment
    ? await participantRepository.findById(assignment.receiverParticipantId)
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

export async function updateParticipantSelfByToken(
  rawToken: string,
  input: UpdateParticipantInputDto,
): Promise<ParticipantSelfViewDto> {
  const { access, participant, exchange } =
    await resolveParticipantAccess(rawToken);

  if (areParticipantSuggestionsUpdatesClosed(exchange)) {
    throw new BadRequestError(
      "Participant suggestions updates are closed for this exchange.",
      {
        code: "PARTICIPANT_SUGGESTIONS_LOCKED",
      },
    );
  }

  const { expectedUpdatedAt, ...updates } = input;

  const updated = expectedUpdatedAt
    ? await participantRepository.updateIfUnchanged(
        participant.id,
        updates,
        expectedUpdatedAt,
      )
    : await participantRepository.update(participant.id, updates);

  if (!updated) {
    if (expectedUpdatedAt) {
      throw new ConflictError(
        "Participant was modified by another user. Refresh and try again.",
        {
          code: "RESOURCE_MODIFIED_CONCURRENTLY",
        },
      );
    }

    throw new NotFoundError("Participant not found.", {
      code: "PARTICIPANT_NOT_FOUND",
    });
  }

  await participantRepository.touchAccess(access.id);

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
      id: updated.id,
      name: updated.name,
      email: updated.email,
      wishlist: updated.wishlist,
      note: updated.note,
      updatedAt: updated.updatedAt,
    },
    assignment: undefined,
  };
}

async function resolveParticipantAccess(rawToken: string) {
  let normalizedToken: string;
  try {
    normalizedToken = normalizeParticipantAccessCode(rawToken);
  } catch {
    throw new NotFoundError("Invalid or expired link.", {
      code: "PARTICIPANT_LINK_INVALID_OR_EXPIRED",
    });
  }

  const tokenHash = sha256(normalizedToken);
  const access =
    await participantRepository.findActiveAccessByTokenHash(tokenHash);

  if (!access) {
    throw new NotFoundError("Invalid or expired link.", {
      code: "PARTICIPANT_LINK_INVALID_OR_EXPIRED",
    });
  }

  const participant = await participantRepository.findById(
    access.participantId,
  );
  if (!participant) {
    throw new NotFoundError("Participant not found.", {
      code: "PARTICIPANT_NOT_FOUND",
    });
  }

  const exchange = await exchangeRepository.findById(access.exchangeId);
  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  return { access, participant, exchange };
}
