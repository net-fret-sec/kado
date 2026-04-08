interface ExchangeRecord {
  id: string;
  name: string;
  description?: string;
  organizerId: string;
  status: "draft" | "ready" | "drawn" | "archived";
  eventDate?: string;
  drawDeadlineAt?: string;
  suggestionsDeadlineAt?: string;
  budget?: number;
  budgetCurrency?: string;
  minWishlistSuggestions?: number;
  lockSuggestionsAfterDraw?: boolean;
  noMutualAssignments?: boolean;
  drawAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminAccessRecord {
  exchangeId: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminSessionRecord {
  id: string;
  exchangeId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

const exchanges = new Map<string, ExchangeRecord>();
const adminAccessByExchangeId = new Map<string, AdminAccessRecord>();
const adminSessions = new Map<string, AdminSessionRecord>();

export const exchangeRepository = {
  create(exchange: ExchangeRecord) {
    exchanges.set(exchange.id, exchange);
    return exchange;
  },

  findById(exchangeId: string) {
    return exchanges.get(exchangeId);
  },

  findAll() {
    return Array.from(exchanges.values());
  },

  update(exchangeId: string, updates: Partial<ExchangeRecord>) {
    const exchange = exchanges.get(exchangeId);
    if (!exchange) return null;
    const updated = {
      ...exchange,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    exchanges.set(exchangeId, updated);
    return updated;
  },

  delete(exchangeId: string) {
    return exchanges.delete(exchangeId);
  },

  createAdminAccess(record: AdminAccessRecord) {
    adminAccessByExchangeId.set(record.exchangeId, record);
    return record;
  },

  findAdminAccess(exchangeId: string) {
    return adminAccessByExchangeId.get(exchangeId);
  },

  createAdminSession(record: AdminSessionRecord) {
    adminSessions.set(record.id, record);
    return record;
  },

  findAdminSessionByTokenHash(tokenHash: string) {
    return Array.from(adminSessions.values()).find(
      (session) => session.tokenHash === tokenHash,
    );
  },

  loadTestData(data: {
    exchanges: ExchangeRecord[];
    adminAccess: AdminAccessRecord[];
    adminSessions: AdminSessionRecord[];
  }) {
    for (const exchange of data.exchanges) {
      exchanges.set(exchange.id, exchange);
    }
    for (const access of data.adminAccess) {
      adminAccessByExchangeId.set(access.exchangeId, access);
    }
    for (const session of data.adminSessions) {
      adminSessions.set(session.id, session);
    }
  },
};
