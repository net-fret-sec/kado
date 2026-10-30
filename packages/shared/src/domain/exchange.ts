export interface Exchange {
  id: string;

  name: string;
  description?: string;

  eventDate?: string;
  plannedDrawDate?: string;
  budget?: number;
  minWishlistSuggestions?: number;
  lockSuggestionsAfterDraw?: boolean;
  noMutualAssignments?: boolean;
  organizerName?: string;

  drawAt?: string;
  createdAt: string;
  updatedAt: string;
}
