// packages/shared/src/dto/participant.dto.ts

import type { ExchangeDto } from "../exchange/exchange.dto";

export interface GiftSuggestionDto {
  title: string;
  imageUrl?: string;
  icon?: string; // bootstrap-icons name, optional
  linkUrl?: string;
}

export type ParticipantStatus = "active" | "removed";

export interface ParticipantDto {
  id: string;
  exchangeId: string;
  name: string;
  email?: string;
  wishlist?: GiftSuggestionDto[];
  note?: string;
  status: ParticipantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateParticipantInputDto {
  name: string;
  email?: string;
  wishlist?: GiftSuggestionDto[];
  note?: string;
}

export interface UpdateParticipantInputDto {
  name?: string;
  email?: string;
  wishlist?: GiftSuggestionDto[];
  note?: string;
}

export interface CreateParticipantResultDto {
  participant: ParticipantDto;
  accessLink: string;
}

export interface RegenerateParticipantAccessInputDto {
  participantId: string;
  revokeExisting: boolean;
}

export interface RegenerateParticipantAccessResultDto {
  participantId: string;
  accessLink: string;
}

export interface ParticipantAssignmentDto {
  receiverName: string;
  receiverWishlist?: GiftSuggestionDto[];
  receiverNote?: string;
}

export interface ParticipantSelfViewDto {
  exchange: Pick<
    ExchangeDto,
    | "id"
    | "name"
    | "description"
    | "status"
    | "eventDate"
    | "drawDeadlineAt"
    | "suggestionsDeadlineAt"
    | "budget"
    | "budgetCurrency"
    | "minWishlistSuggestions"
    | "lockSuggestionsAfterDraw"
  >;
  participant: Pick<
    ParticipantDto,
    "id" | "name" | "email" | "wishlist" | "note"
  >;
  assignment?: ParticipantAssignmentDto;
}
