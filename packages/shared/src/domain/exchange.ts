export interface Exchange {
  id: string;

  name: string;
  description?: string;

  eventDate?: string;
  budget?: number;
  minWishlistSuggestions?: number;
  lockSuggestionsAfterDraw?: boolean;
  noMutualAssignments?: boolean;
  organizerName?: string;

  drawAt?: string;
  createdAt: string;
  updatedAt: string;
}
