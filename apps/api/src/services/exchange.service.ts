import type {
  CreateExchangeInputDto,
  CreateExchangeResultDto,
  ExchangeDto,
  UpdateExchangeInputDto,
} from "@kado/shared";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../lib/http-errors";
import { exchangeRepository } from "../repositories/exchange.repository";
import { participantRepository } from "../repositories/participant.repository";
import {
  generateId,
  generateOpaqueToken,
  hashPassword,
  sha256,
  verifyPassword,
} from "../lib/crypto";
import { createParticipant } from "./participant.service";
import { assignmentRepository } from "../repositories/assignment.repository";
import { exclusionRuleRepository } from "../repositories/exclusion-rule.repository";
import { withTransaction } from "../db";

interface DrawAssignment {
  giverParticipantId: string;
  receiverParticipantId: string;
}

const ARCHIVE_AFTER_DAYS = 30;

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

  const archiveAt =
    eventLocalEnd.getTime() + ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() > archiveAt;
}

function toExchangeDto(
  exchange: {
    id: string;
    name: string;
    description?: string;
    organizerId: string;
    eventDate?: string;
    budget?: number;
    minWishlistSuggestions?: number;
    lockSuggestionsAfterDraw?: boolean;
    noMutualAssignments?: boolean;
    drawAt?: string;
    createdAt: string;
    updatedAt: string;
  },
  options?: {
    organizerName?: string;
    participants?: ExchangeDto["participants"];
  },
): ExchangeDto {
  return {
    ...exchange,
    isDrawn: isExchangeDrawn(exchange),
    isArchived: isExchangeArchived(exchange),
    organizerName: options?.organizerName,
    participants: options?.participants,
  };
}

function buildAssignmentsWithExclusions(
  participantIds: string[],
  exclusions: Array<{
    giverParticipantId: string;
    receiverParticipantId: string;
  }>,
  noMutualAssignments: boolean,
): DrawAssignment[] | null {
  const forbiddenByGiver = new Map<string, Set<string>>();

  for (const giverId of participantIds) {
    forbiddenByGiver.set(giverId, new Set([giverId]));
  }

  for (const exclusion of exclusions) {
    const forbidden = forbiddenByGiver.get(exclusion.giverParticipantId);
    if (forbidden) {
      forbidden.add(exclusion.receiverParticipantId);
    }
  }

  const remainingGivers = new Set(participantIds);
  const usedReceivers = new Set<string>();
  const assignments = new Map<string, string>();

  function solve(): boolean {
    if (remainingGivers.size === 0) {
      return true;
    }

    let selectedGiverId: string | undefined;
    let selectedCandidates: string[] = [];

    for (const giverId of remainingGivers) {
      const forbidden = forbiddenByGiver.get(giverId) ?? new Set<string>();

      const candidates = participantIds
        .filter(
          (receiverId) =>
            !usedReceivers.has(receiverId) && !forbidden.has(receiverId),
        )
        .sort((a, b) => a.localeCompare(b));

      if (!selectedGiverId || candidates.length < selectedCandidates.length) {
        selectedGiverId = giverId;
        selectedCandidates = candidates;
      }

      if (candidates.length === 0) {
        return false;
      }
    }

    if (!selectedGiverId) {
      return false;
    }

    remainingGivers.delete(selectedGiverId);

    for (const receiverId of selectedCandidates) {
      if (
        noMutualAssignments &&
        assignments.get(receiverId) === selectedGiverId
      ) {
        continue;
      }

      assignments.set(selectedGiverId, receiverId);
      usedReceivers.add(receiverId);

      if (solve()) {
        return true;
      }

      assignments.delete(selectedGiverId);
      usedReceivers.delete(receiverId);
    }

    remainingGivers.add(selectedGiverId);
    return false;
  }

  if (!solve()) {
    return null;
  }

  return participantIds.map((giverParticipantId) => ({
    giverParticipantId,
    receiverParticipantId: assignments.get(giverParticipantId) as string,
  }));
}

function buildSessionExpiryIso(): string {
  return new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
}

async function createAdminSession(exchangeId: string): Promise<string> {
  const now = new Date().toISOString();
  const adminSessionToken = generateOpaqueToken("adm");

  await exchangeRepository.createAdminSession({
    id: generateId("sess"),
    exchangeId,
    tokenHash: sha256(adminSessionToken),
    createdAt: now,
    expiresAt: buildSessionExpiryIso(),
  });

  return adminSessionToken;
}

export async function createExchange(
  input: CreateExchangeInputDto,
): Promise<CreateExchangeResultDto> {
  const now = new Date().toISOString();

  const exchange = {
    id: generateId("exc"),
    name: input.name,
    description: input.description,
    organizerId: "", // Temporary
    eventDate: input.eventDate,
    budget: input.budget,
    minWishlistSuggestions: input.minWishlistSuggestions ?? 0,
    lockSuggestionsAfterDraw: input.lockSuggestionsAfterDraw ?? true,
    noMutualAssignments: input.noMutualAssignments ?? false,
    createdAt: now,
    updatedAt: now,
  };

  await exchangeRepository.create(exchange);

  // Create organizer participant if name provided
  let organizerId = "";
  if (input.organizerName) {
    const organizerParticipant = await createParticipant(exchange.id, {
      name: input.organizerName,
      email: undefined,
      wishlist: undefined,
      note: undefined,
    });
    organizerId = organizerParticipant.participant.id;

    // Update exchange with organizerId
    await exchangeRepository.update(exchange.id, { organizerId });

    // If not participates, remove from participants list (but keep as organizer)
    if (!(input.organizerParticipates ?? true)) {
      // For now, since participants are fetched separately, we can handle in getExchangeById
      // But to keep simple, if not participates, we don't add to participants, but organizerId is set
    }
  }

  await exchangeRepository.createAdminAccess({
    exchangeId: exchange.id,
    passwordHash: hashPassword(input.adminPassword),
    createdAt: now,
    updatedAt: now,
  });

  const adminSessionToken = await createAdminSession(exchange.id);

  return {
    exchange: toExchangeDto({ ...exchange, organizerId }),
    adminSessionToken,
  };
}

export async function getExchangeById(
  exchangeId: string,
): Promise<ExchangeDto> {
  const exchange = await exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  const participants = await participantRepository.findByExchangeId(exchangeId);

  // Get organizer name from participant
  const organizer = participants.find((p) => p.id === exchange.organizerId);
  const organizerName = organizer ? organizer.name : "Unknown";

  return {
    ...toExchangeDto(exchange, { organizerName, participants }),
  };
}

export async function getExchangePublicById(exchangeId: string): Promise<{
  id: string;
  name: string;
  description?: string;
  organizerName?: string;
  isDrawn: boolean;
  isArchived: boolean;
  eventDate?: string;
  budget?: number;
  minWishlistSuggestions?: number;
  lockSuggestionsAfterDraw?: boolean;
  noMutualAssignments?: boolean;
  drawAt?: string;
  participantsCount: number;
  updatedAt: string;
}> {
  const exchange = await exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  const participants = await participantRepository.findByExchangeId(exchangeId);
  const organizer = participants.find((p) => p.id === exchange.organizerId);

  return {
    ...toExchangeDto(exchange),
    organizerName: organizer ? organizer.name : "Unknown",
    participantsCount: participants.length,
  };
}

export async function authenticateAdminSession(
  exchangeId: string,
  adminPassword: string,
): Promise<{ adminSessionToken: string }> {
  const exchange = await exchangeRepository.findById(exchangeId);
  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  const adminAccess = await exchangeRepository.findAdminAccess(exchangeId);
  if (
    !adminAccess ||
    !verifyPassword(adminPassword, adminAccess.passwordHash)
  ) {
    throw new BadRequestError("Invalid admin credentials.", {
      code: "ADMIN_CREDENTIALS_INVALID",
    });
  }

  const adminSessionToken = await createAdminSession(exchangeId);
  return { adminSessionToken };
}

export async function revokeAdminSession(
  exchangeId: string,
  rawToken: string,
): Promise<void> {
  const exchange = await exchangeRepository.findById(exchangeId);
  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  if (!rawToken) {
    return;
  }

  await exchangeRepository.deleteAdminSessionByTokenHash(sha256(rawToken));
}

export async function changeAdminPassword(
  exchangeId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const exchange = await exchangeRepository.findById(exchangeId);
  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  const adminAccess = await exchangeRepository.findAdminAccess(exchangeId);
  if (
    !adminAccess ||
    !verifyPassword(currentPassword, adminAccess.passwordHash)
  ) {
    throw new BadRequestError("Invalid admin credentials.", {
      code: "ADMIN_CREDENTIALS_INVALID",
    });
  }

  await exchangeRepository.updateAdminAccessPassword(
    exchangeId,
    hashPassword(newPassword),
  );
}

export async function listExchanges(): Promise<ExchangeDto[]> {
  const exchanges = await exchangeRepository.findAll();
  return Promise.all(
    exchanges.map(async (exchange) => {
      const participants = await participantRepository.findByExchangeId(
        exchange.id,
      );
      const organizer = participants.find((p) => p.id === exchange.organizerId);
      return toExchangeDto(exchange, {
        organizerName: organizer ? organizer.name : "Unknown",
        participants,
      });
    }),
  );
}

export async function updateExchange(
  exchangeId: string,
  input: UpdateExchangeInputDto,
): Promise<ExchangeDto> {
  const exchange = await exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  const { expectedUpdatedAt, ...updates } = input;

  const updated = expectedUpdatedAt
    ? await exchangeRepository.updateIfUnchanged(
        exchangeId,
        updates,
        expectedUpdatedAt,
      )
    : await exchangeRepository.update(exchangeId, updates);

  if (!updated) {
    if (expectedUpdatedAt) {
      throw new ConflictError(
        "Exchange was modified by another user. Refresh and try again.",
        {
          code: "RESOURCE_MODIFIED_CONCURRENTLY",
        },
      );
    }

    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  return toExchangeDto(updated);
}

export async function deleteExchange(exchangeId: string): Promise<void> {
  await withTransaction(async (db) => {
    const exchange = await exchangeRepository.findById(exchangeId, db);

    if (!exchange) {
      throw new NotFoundError("Exchange not found.", {
        code: "EXCHANGE_NOT_FOUND",
      });
    }

    await exclusionRuleRepository.deleteByExchangeId(exchangeId, db);
    await exchangeRepository.delete(exchangeId, db);
  });
}

export async function drawExchange(exchangeId: string): Promise<ExchangeDto> {
  return await withTransaction(async (db) => {
    const exchange = await exchangeRepository.findById(exchangeId, db);

    if (!exchange) {
      throw new NotFoundError("Exchange not found.", {
        code: "EXCHANGE_NOT_FOUND",
      });
    }

    if (isExchangeArchived(exchange)) {
      throw new BadRequestError("Archived exchanges cannot be drawn.", {
        code: "EXCHANGE_ARCHIVED_CANNOT_DRAW",
      });
    }

    if (isExchangeDrawn(exchange)) {
      return toExchangeDto(exchange);
    }

    const participants = (
      await participantRepository.findByExchangeId(exchangeId, db)
    ).filter((p) => p.status === "active");

    if (participants.length < 3) {
      throw new BadRequestError(
        "At least 3 active participants are required to draw.",
        {
          code: "DRAW_MIN_ACTIVE_PARTICIPANTS",
        },
      );
    }

    const minWishlistSuggestions = exchange.minWishlistSuggestions ?? 0;
    if (minWishlistSuggestions > 0) {
      const participantsMissingSuggestions = participants
        .filter(
          (participant) =>
            (participant.wishlist?.length ?? 0) < minWishlistSuggestions,
        )
        .map((participant) => participant.id);

      if (participantsMissingSuggestions.length > 0) {
        throw new BadRequestError(
          "Some participants are missing required wishlist suggestions.",
          {
            code: "DRAW_MIN_WISHLIST_SUGGESTIONS",
            minWishlistSuggestions,
            participantsMissingSuggestions,
          },
        );
      }
    }

    const ordered = [...participants].sort((a, b) => a.id.localeCompare(b.id));
    const participantIds = ordered.map((participant) => participant.id);
    const exclusions = await exclusionRuleRepository.findByExchangeId(
      exchangeId,
      db,
    );

    const drawAssignments = buildAssignmentsWithExclusions(
      participantIds,
      exclusions,
      exchange.noMutualAssignments ?? false,
    );

    if (!drawAssignments) {
      const noMutualAssignments = exchange.noMutualAssignments ?? false;
      const hasExclusionRules = exclusions.length > 0;

      let message = "No valid draw is possible with the current settings.";
      if (hasExclusionRules && noMutualAssignments) {
        message =
          "No valid draw is possible with the current exclusion rules and no-mutual-assignment setting.";
      } else if (hasExclusionRules) {
        message = "No valid draw is possible with the current exclusion rules.";
      } else if (noMutualAssignments) {
        message =
          "No valid draw is possible with the no-mutual-assignment setting.";
      }

      throw new BadRequestError(message, {
        code: "DRAW_IMPOSSIBLE",
        hasExclusionRules,
        noMutualAssignments,
      });
    }

    const now = new Date().toISOString();
    const assignments = drawAssignments.map((assignment) => {
      return {
        id: generateId("asg"),
        exchangeId,
        giverParticipantId: assignment.giverParticipantId,
        receiverParticipantId: assignment.receiverParticipantId,
        createdAt: now,
      };
    });

    await assignmentRepository.deleteByExchangeId(exchangeId, db);
    await assignmentRepository.createMany(assignments, db);

    const updated = await exchangeRepository.update(
      exchangeId,
      {
        drawAt: now,
      },
      db,
    );

    if (!updated) {
      throw new NotFoundError("Exchange not found.", {
        code: "EXCHANGE_NOT_FOUND",
      });
    }

    return toExchangeDto(updated);
  });
}

export async function cancelExchangeDraw(
  exchangeId: string,
): Promise<ExchangeDto> {
  return await withTransaction(async (db) => {
    const exchange = await exchangeRepository.findById(exchangeId, db);

    if (!exchange) {
      throw new NotFoundError("Exchange not found.", {
        code: "EXCHANGE_NOT_FOUND",
      });
    }

    if (isExchangeArchived(exchange)) {
      throw new BadRequestError("Archived exchanges cannot be modified.", {
        code: "EXCHANGE_ARCHIVED_CANNOT_MODIFY",
      });
    }

    await assignmentRepository.deleteByExchangeId(exchangeId, db);

    const updated = await exchangeRepository.update(
      exchangeId,
      {
        drawAt: undefined,
      },
      db,
    );

    if (!updated) {
      throw new NotFoundError("Exchange not found.", {
        code: "EXCHANGE_NOT_FOUND",
      });
    }

    return toExchangeDto(updated);
  });
}
