// packages/shared/src/dto/exchange.dto.ts

import type { ParticipantDto } from "../participant/participant.dto";

export interface ExchangeDto {
  id: string;
  name: string;
  description?: string;
  organizerId: string;
  organizerName?: string; // Computed for display

  isDrawn: boolean;
  isArchived: boolean;

  eventDate?: string;
  budget?: number;
  minWishlistSuggestions?: number;
  lockSuggestionsAfterDraw?: boolean;
  noMutualAssignments?: boolean;

  drawAt?: string;
  createdAt: string;
  updatedAt: string;

  participants?: ParticipantDto[];
}

export interface CreateExchangeInputDto {
  name: string;
  description?: string;
  organizerName?: string;
  organizerParticipates?: boolean;

  eventDate?: string;
  budget?: number;
  minWishlistSuggestions?: number;
  lockSuggestionsAfterDraw?: boolean;
  noMutualAssignments?: boolean;

  adminPassword: string;
}

export interface CreateExchangeResultDto {
  exchange: ExchangeDto;
  adminSessionToken: string;
}

export interface UpdateExchangeInputDto {
  expectedUpdatedAt?: string;
  name?: string;
  description?: string;
  organizerId?: string;

  eventDate?: string;
  budget?: number;
  minWishlistSuggestions?: number;
  lockSuggestionsAfterDraw?: boolean;
  noMutualAssignments?: boolean;
}

export interface ExchangeAdminViewDto {
  exchange: ExchangeDto;
  participantsCount: number;
  exclusionRulesCount: number;
  assignmentsExist: boolean;
}
