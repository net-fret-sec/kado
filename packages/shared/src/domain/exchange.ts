export type ExchangeStatus = "draft" | "ready" | "drawn" | "archived";

export interface Exchange {
  id: string;

  name: string;
  description?: string;

  status: ExchangeStatus;

  eventDate?: string;
  drawDeadlineAt?: string;
  suggestionsDeadlineAt?: string;
  budget?: number;
  budgetCurrency?: string;
  minWishlistSuggestions?: number;
  lockSuggestionsAfterDraw?: boolean;
  organizerName?: string;

  drawAt?: string;
  createdAt: string;
  updatedAt: string;
}
