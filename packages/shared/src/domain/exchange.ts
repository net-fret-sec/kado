export type ExchangeStatus = "draft" | "ready" | "drawn" | "archived";

export interface Exchange {
  id: string;

  name: string;
  description?: string;

  status: ExchangeStatus;

  eventDate?: string;
  drawDeadlineAt?: string;
  budget?: number;
  budgetCurrency?: string;
  minWishlistSuggestions?: number;
  organizerName?: string;

  drawAt?: string;
  createdAt: string;
  updatedAt: string;
}
