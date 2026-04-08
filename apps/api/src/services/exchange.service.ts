import type {
  CreateExchangeInputDto,
  CreateExchangeResultDto,
  ExchangeDto,
  UpdateExchangeInputDto,
} from "@kado/shared";
import { BadRequestError, NotFoundError } from "../lib/http-errors";
import { exchangeRepository } from "../repositories/exchange.repository";
import { participantRepository } from "../repositories/participant.repository";
import {
  generateId,
  generateOpaqueToken,
  hashPassword,
  sha256,
} from "../lib/crypto";
import { createParticipant } from "./participant.service";
import { assignmentRepository } from "../repositories/assignment.repository";
import { exclusionRuleRepository } from "../repositories/exclusion-rule.repository";

interface DrawAssignment {
  giverParticipantId: string;
  receiverParticipantId: string;
}

function isSuggestionsDeadlineAfterEventDate(
  eventDate?: string,
  suggestionsDeadlineAt?: string,
) {
  if (!eventDate || !suggestionsDeadlineAt) {
    return false;
  }

  const suggestionsDeadline = new Date(suggestionsDeadlineAt);
  const eventDateEnd = new Date(`${eventDate}T23:59:59.999Z`);

  if (
    Number.isNaN(suggestionsDeadline.getTime()) ||
    Number.isNaN(eventDateEnd.getTime())
  ) {
    return false;
  }

  return suggestionsDeadline.getTime() > eventDateEnd.getTime();
}

function assertSuggestionsDeadlineConsistency(params: {
  eventDate?: string;
  suggestionsDeadlineAt?: string;
}) {
  if (
    isSuggestionsDeadlineAfterEventDate(
      params.eventDate,
      params.suggestionsDeadlineAt,
    )
  ) {
    throw new BadRequestError(
      "Suggestions deadline cannot be after the gift exchange moment.",
      {
        code: "SUGGESTIONS_DEADLINE_AFTER_EXCHANGE_MOMENT",
      },
    );
  }
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

export async function createExchange(
  input: CreateExchangeInputDto,
): Promise<CreateExchangeResultDto> {
  assertSuggestionsDeadlineConsistency({
    eventDate: input.eventDate,
    suggestionsDeadlineAt: input.suggestionsDeadlineAt,
  });

  const now = new Date().toISOString();

  const exchange: ExchangeDto = {
    id: generateId("exc"),
    name: input.name,
    description: input.description,
    organizerId: "", // Temporary
    status: "draft",
    eventDate: input.eventDate,
    drawDeadlineAt: input.drawDeadlineAt,
    suggestionsDeadlineAt: input.suggestionsDeadlineAt,
    budget: input.budget,
    budgetCurrency: input.budgetCurrency,
    minWishlistSuggestions: input.minWishlistSuggestions ?? 0,
    lockSuggestionsAfterDraw: input.lockSuggestionsAfterDraw ?? true,
    noMutualAssignments: input.noMutualAssignments ?? false,
    createdAt: now,
    updatedAt: now,
  };

  exchangeRepository.create(exchange);

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
    exchangeRepository.update(exchange.id, { organizerId });

    // If not participates, remove from participants list (but keep as organizer)
    if (!(input.organizerParticipates ?? true)) {
      // For now, since participants are fetched separately, we can handle in getExchangeById
      // But to keep simple, if not participates, we don't add to participants, but organizerId is set
    }
  }

  exchangeRepository.createAdminAccess({
    exchangeId: exchange.id,
    passwordHash: hashPassword(input.adminPassword),
    createdAt: now,
    updatedAt: now,
  });

  const adminSessionToken = generateOpaqueToken("adm");
  exchangeRepository.createAdminSession({
    id: generateId("sess"),
    exchangeId: exchange.id,
    tokenHash: sha256(adminSessionToken),
    createdAt: now,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  });

  return {
    exchange: { ...exchange, organizerId },
    adminSessionToken,
  };
}

export async function getExchangeById(
  exchangeId: string,
): Promise<ExchangeDto> {
  const exchange = exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  const participants = participantRepository.findByExchangeId(exchangeId);

  // Get organizer name from participant
  const organizer = participants.find((p) => p.id === exchange.organizerId);
  const organizerName = organizer ? organizer.name : "Unknown";

  return {
    ...exchange,
    organizerName, // Add for display
    participants,
  };
}

export async function listExchanges(): Promise<ExchangeDto[]> {
  const exchanges = exchangeRepository.findAll();
  return exchanges.map((exchange) => {
    const participants = participantRepository.findByExchangeId(exchange.id);
    const organizer = participants.find((p) => p.id === exchange.organizerId);
    return {
      ...exchange,
      organizerName: organizer ? organizer.name : "Unknown",
      participants,
    };
  });
}

export async function updateExchange(
  exchangeId: string,
  input: UpdateExchangeInputDto,
): Promise<ExchangeDto> {
  const exchange = exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  const hasEventDateUpdate = Object.prototype.hasOwnProperty.call(
    input,
    "eventDate",
  );
  const hasSuggestionsDeadlineUpdate = Object.prototype.hasOwnProperty.call(
    input,
    "suggestionsDeadlineAt",
  );

  const nextEventDate = hasEventDateUpdate
    ? input.eventDate
    : exchange.eventDate;
  const nextSuggestionsDeadlineAt = hasSuggestionsDeadlineUpdate
    ? input.suggestionsDeadlineAt
    : exchange.suggestionsDeadlineAt;

  assertSuggestionsDeadlineConsistency({
    eventDate: nextEventDate,
    suggestionsDeadlineAt: nextSuggestionsDeadlineAt,
  });

  const updated = exchangeRepository.update(exchangeId, input);

  if (!updated) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  return updated;
}

export async function deleteExchange(exchangeId: string): Promise<void> {
  const exchange = exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  exclusionRuleRepository.deleteByExchangeId(exchangeId);
  exchangeRepository.delete(exchangeId);
}

export async function drawExchange(exchangeId: string): Promise<ExchangeDto> {
  const exchange = exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  if (exchange.status === "archived") {
    throw new BadRequestError("Archived exchanges cannot be drawn.", {
      code: "EXCHANGE_ARCHIVED_CANNOT_DRAW",
    });
  }

  if (exchange.status === "drawn") {
    return exchange;
  }

  const participants = participantRepository
    .findByExchangeId(exchangeId)
    .filter((p) => p.status === "active");

  if (exchange.drawDeadlineAt) {
    const drawDeadline = new Date(exchange.drawDeadlineAt);
    if (
      !Number.isNaN(drawDeadline.getTime()) &&
      drawDeadline.getTime() < Date.now()
    ) {
      throw new BadRequestError("The draw deadline has already passed.", {
        code: "DRAW_DEADLINE_PASSED",
        drawDeadlineAt: exchange.drawDeadlineAt,
      });
    }
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

  if (participants.length < 3) {
    throw new BadRequestError(
      "At least 3 active participants are required to draw.",
      {
        code: "DRAW_MIN_ACTIVE_PARTICIPANTS",
      },
    );
  }

  const ordered = [...participants].sort((a, b) => a.id.localeCompare(b.id));
  const participantIds = ordered.map((participant) => participant.id);
  const exclusions = exclusionRuleRepository.findByExchangeId(exchangeId);

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

  assignmentRepository.deleteByExchangeId(exchangeId);
  assignmentRepository.createMany(assignments);

  const updated = exchangeRepository.update(exchangeId, {
    status: "drawn",
    drawAt: now,
  });

  if (!updated) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  return updated;
}

export async function cancelExchangeDraw(
  exchangeId: string,
): Promise<ExchangeDto> {
  const exchange = exchangeRepository.findById(exchangeId);

  if (!exchange) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  if (exchange.status === "archived") {
    throw new BadRequestError("Archived exchanges cannot be modified.", {
      code: "EXCHANGE_ARCHIVED_CANNOT_MODIFY",
    });
  }

  assignmentRepository.deleteByExchangeId(exchangeId);

  const updated = exchangeRepository.update(exchangeId, {
    status: "ready",
    drawAt: undefined,
  });

  if (!updated) {
    throw new NotFoundError("Exchange not found.", {
      code: "EXCHANGE_NOT_FOUND",
    });
  }

  return updated;
}
