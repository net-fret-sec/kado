// packages/shared/src/dto/participant.dto.ts

import type { ExchangeDto } from "../exchange/exchange.dto";

export type ParticipantStatus = "active" | "removed";

export interface ParticipantDto {
  id: string;
  exchangeId: string;
  name: string;
  email?: string;
  wishlist?: string;
  note?: string;
  status: ParticipantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateParticipantInputDto {
  name: string;
  email?: string;
  wishlist?: string;
  note?: string;
}

export interface UpdateParticipantInputDto {
  name?: string;
  email?: string;
  wishlist?: string;
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
  receiverWishlist?: string;
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
    | "budget"
    | "budgetCurrency"
  >;
  participant: Pick<ParticipantDto, "id" | "name" | "wishlist" | "note">;
  assignment?: ParticipantAssignmentDto;
}
