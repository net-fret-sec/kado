// packages/shared/src/dto/exchange.dto.ts

import type { ParticipantDto } from "../participant/participant.dto";

export type ExchangeStatus = "draft" | "ready" | "drawn" | "archived";

export interface ExchangeDto {
  id: string;
  name: string;
  description?: string;
  organizerId: string;
  organizerName?: string; // Computed for display

  status: ExchangeStatus;

  eventDate?: string;
  drawDeadlineAt?: string;
  budget?: number;
  budgetCurrency?: string;
  minWishlistSuggestions?: number;
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
  drawDeadlineAt?: string;
  budget?: number;
  budgetCurrency?: string;
  minWishlistSuggestions?: number;
  noMutualAssignments?: boolean;

  adminPassword: string;
}

export interface CreateExchangeResultDto {
  exchange: ExchangeDto;
  adminSessionToken: string;
}

export interface UpdateExchangeInputDto {
  name?: string;
  description?: string;
  organizerId?: string;
  status?: ExchangeStatus;

  eventDate?: string;
  drawDeadlineAt?: string;
  budget?: number;
  budgetCurrency?: string;
  minWishlistSuggestions?: number;
  noMutualAssignments?: boolean;
}

export interface ExchangeAdminViewDto {
  exchange: ExchangeDto;
  participantsCount: number;
  exclusionRulesCount: number;
  assignmentsExist: boolean;
}
