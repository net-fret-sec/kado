import type {
  CreateExchangeInputDto,
  CreateExchangeResultDto,
  ExchangeDto,
  ExchangePublicViewDto,
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
import { createParticipantInTransaction } from "./participant.service";
import { assignmentRepository } from "../repositories/assignment.repository";
import { exclusionRuleRepository } from "../repositories/exclusion-rule.repository";
import { withTransaction, type DbExecutor } from "../db";
import { getConfig } from "../lib/config";
import { runDraw } from "../draw-worker";
import { withExchangeTransaction } from "../lib/exchange-transaction";
import {
  assertNotArchived,
  assertUnchangedFields,
  isExchangeArchived,
  isExchangeDrawn,
} from "../lib/exchange-state";

function toExchangeDto(
  exchange: {
    id: string;
    name: string;
    description?: string;
    organizerId: string;
    organizerName?: string;
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
    organizerName: options?.organizerName ?? exchange.organizerName,
    participants: options?.participants,
  };
}

function buildSessionExpiryIso(): string {
  return new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
}

async function createAdminSession(
  exchangeId: string,
  db: DbExecutor,
): Promise<string> {
  await exchangeRepository.deleteExpiredAdminSessions(exchangeId, db);
  const now = new Date().toISOString();
  const adminSessionToken = generateOpaqueToken("adm");

  await exchangeRepository.createAdminSession(
    {
      id: generateId("sess"),
      exchangeId,
      tokenHash: sha256(adminSessionToken),
      createdAt: now,
      expiresAt: buildSessionExpiryIso(),
    },
    db,
  );

  return adminSessionToken;
}

export async function createExchange(
  input: CreateExchangeInputDto,
): Promise<CreateExchangeResultDto> {
  return withTransaction(async (db) => {
    const now = new Date().toISOString();

    const exchange = {
      id: generateId("exc"),
      name: input.name,
      description: input.description,
      organizerId: "",
      organizerName:
        input.organizerParticipates === false ? input.organizerName : undefined,
      eventDate: input.eventDate,
      budget: input.budget,
      minWishlistSuggestions: input.minWishlistSuggestions ?? 0,
      lockSuggestionsAfterDraw: input.lockSuggestionsAfterDraw ?? true,
      noMutualAssignments: input.noMutualAssignments ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await exchangeRepository.create(exchange, db);

    // Create organizer participant if name provided
    if (input.organizerName && input.organizerParticipates !== false) {
      const organizerParticipant = await createParticipantInTransaction(
        exchange,
        {
          name: input.organizerName,
          email: undefined,
          wishlist: undefined,
          note: undefined,
        },
        db,
      );
      const organizerId = organizerParticipant.participant.id;

      // Update exchange with organizerId
      await exchangeRepository.update(exchange.id, { organizerId }, db);
    }

    await exchangeRepository.createAdminAccess(
      {
        exchangeId: exchange.id,
        passwordHash: await hashPassword(input.adminPassword),
        createdAt: now,
        updatedAt: now,
      },
      db,
    );

    const adminSessionToken = await createAdminSession(exchange.id, db);

    const saved = await exchangeRepository.findById(exchange.id, db);
    if (!saved) throw new Error("Exchange creation did not persist.");
    return {
      exchange: toExchangeDto(saved),
      adminSessionToken,
    };
  });
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
  const organizerName = organizer
    ? organizer.name
    : (exchange.organizerName ?? "Unknown");

  return {
    ...toExchangeDto(exchange, { organizerName, participants }),
  };
}

export async function getExchangePublicById(exchangeId: string): Promise<ExchangePublicViewDto> {
  const exchange = await exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  const participants = await participantRepository.findByExchangeId(exchangeId);
  const organizer = participants.find((p) => p.id === exchange.organizerId);

  return {
    id: exchange.id,
    name: exchange.name,
    description: exchange.description,
    isDrawn: isExchangeDrawn(exchange),
    isArchived: isExchangeArchived(exchange),
    eventDate: exchange.eventDate,
    budget: exchange.budget,
    minWishlistSuggestions: exchange.minWishlistSuggestions,
    lockSuggestionsAfterDraw: exchange.lockSuggestionsAfterDraw,
    noMutualAssignments: exchange.noMutualAssignments,
    drawAt: exchange.drawAt,
    updatedAt: exchange.updatedAt,
    organizerName: organizer
      ? organizer.name
      : (exchange.organizerName ?? "Unknown"),
    participantsCount: participants.length,
  };
}

export async function authenticateAdminSession(
  exchangeId: string,
  adminPassword: string,
): Promise<{ adminSessionToken: string }> {
  return withExchangeTransaction(exchangeId, async (_exchange, db) => {
    const adminAccess = await exchangeRepository.findAdminAccess(
      exchangeId,
      db,
    );
    if (
      !adminAccess ||
      !(await verifyPassword(adminPassword, adminAccess.passwordHash))
    ) {
      throw new BadRequestError("Invalid admin credentials.", {
        code: "ADMIN_CREDENTIALS_INVALID",
      });
    }

    const adminSessionToken = await createAdminSession(exchangeId, db);
    return { adminSessionToken };
  });
}

export async function revokeAdminSession(
  exchangeId: string,
  rawToken: string,
): Promise<void> {
  return withExchangeTransaction(exchangeId, async (_exchange, db) => {
    if (!rawToken) {
      return;
    }

    await exchangeRepository.deleteAdminSessionByTokenHash(
      sha256(rawToken),
      db,
    );
  });
}

export async function changeAdminPassword(
  exchangeId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ adminSessionToken: string }> {
  return withExchangeTransaction(exchangeId, async (_exchange, db) => {
    const adminAccess = await exchangeRepository.findAdminAccess(
      exchangeId,
      db,
    );
    if (
      !adminAccess ||
      !(await verifyPassword(currentPassword, adminAccess.passwordHash))
    ) {
      throw new BadRequestError("Invalid admin credentials.", {
        code: "ADMIN_CREDENTIALS_INVALID",
      });
    }

    await exchangeRepository.updateAdminAccessPassword(
      exchangeId,
      await hashPassword(newPassword),
      db,
    );
    await exchangeRepository.deleteAdminSessions(exchangeId, db);
    return { adminSessionToken: await createAdminSession(exchangeId, db) };
  });
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
        organizerName: organizer
          ? organizer.name
          : (exchange.organizerName ?? "Unknown"),
        participants,
      });
    }),
  );
}

export async function updateExchange(
  exchangeId: string,
  input: UpdateExchangeInputDto,
): Promise<ExchangeDto> {
  return withExchangeTransaction(exchangeId, async (exchange, db) => {
    assertNotArchived(exchange);
    const { expectedUpdatedAt, ...updates } = input;
    if (isExchangeDrawn(exchange)) {
      assertUnchangedFields(
        exchange,
        updates,
        [
          "organizerId",
          "organizerName",
          "minWishlistSuggestions",
          "lockSuggestionsAfterDraw",
          "noMutualAssignments",
        ],
        "EXCHANGE_DRAW_SETTINGS_LOCKED",
      );
    }
    if (updates.organizerName !== undefined && exchange.organizerId)
      throw new BadRequestError("Edit the organizer profile instead.", {
        code: "ORGANIZER_NAME_REQUIRES_NON_PARTICIPANT",
      });
    if (
      Object.hasOwn(updates, "organizerId") &&
      updates.organizerId !== exchange.organizerId
    ) {
      const organizer = updates.organizerId
        ? await participantRepository.findById(
            exchangeId,
            updates.organizerId,
            db,
          )
        : undefined;
      updates.organizerName = undefined;
      if (!organizer)
        throw new BadRequestError("Organizer must belong to this exchange.", {
          code: "PARTICIPANT_OUTSIDE_EXCHANGE",
        });
    }

    const updated = expectedUpdatedAt
      ? await exchangeRepository.updateIfUnchanged(
          exchangeId,
          updates,
          expectedUpdatedAt,
          db,
        )
      : await exchangeRepository.update(exchangeId, updates, db);

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
  });
}

export async function deleteExchange(exchangeId: string): Promise<void> {
  await withExchangeTransaction(exchangeId, async (_exchange, db) => {
    await exclusionRuleRepository.deleteByExchangeId(exchangeId, db);
    await exchangeRepository.delete(exchangeId, db);
  });
}

export async function drawExchange(exchangeId: string): Promise<ExchangeDto> {
  return await withExchangeTransaction(exchangeId, async (exchange, db) => {
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

    if (participants.length > getConfig().maxParticipants)
      throw new BadRequestError("Participant limit exceeded.", {
        code: "PARTICIPANT_LIMIT_REACHED",
      });
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

    const drawAssignments = await runDraw(
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
  return await withExchangeTransaction(exchangeId, async (exchange, db) => {
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
