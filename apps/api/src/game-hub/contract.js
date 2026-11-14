import { z } from "zod";

export const GAME_HUB_API_VERSION = "v1";
export const DEMO_CREDIT_UNIT = "DEMO_CREDIT";
export const DEMO_MAX_TRANSACTION_CREDITS = 500;
export const PROVIDER_IDS = Object.freeze(["internal-demo", "vfair-games", "open-rgs"]);
export const TRANSACTION_STATUSES = Object.freeze([
  "committed",
  "settled",
  "refunded",
  "reconciliation_required"
]);

const identifier = z.string().trim().min(1).max(128);
const amount = z.number().int().positive().max(DEMO_MAX_TRANSACTION_CREDITS);
const providerId = z.enum(PROVIDER_IDS);
const idempotencyKey = z.string().trim().min(8).max(128);

export const gameHubSchemas = Object.freeze({
  launchSession: z.object({
    providerId,
    gameId: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,95}$/),
    locale: z.string().trim().min(2).max(16).default("es-MX")
  }).strict(),
  getBalance: z.object({ sessionToken: z.string().min(1) }).strict(),
  placeBet: z.object({
    sessionToken: z.string().min(1),
    idempotencyKey,
    externalTransactionId: identifier.optional(),
    roundId: identifier,
    amount
  }).strict(),
  settleWin: z.object({
    sessionToken: z.string().min(1),
    idempotencyKey,
    externalTransactionId: identifier.optional(),
    betTransactionId: z.string().uuid(),
    amount
  }).strict(),
  refundBet: z.object({
    sessionToken: z.string().min(1),
    idempotencyKey,
    externalTransactionId: identifier.optional(),
    betTransactionId: z.string().uuid()
  }).strict(),
  getTransaction: z.object({
    sessionToken: z.string().min(1),
    transactionId: z.string().uuid()
  }).strict(),
  closeSession: z.object({ sessionToken: z.string().min(1) }).strict()
});

export class GameHubError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "GameHubError";
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

export function parseHubInput(operation, input) {
  const schema = gameHubSchemas[operation];
  if (!schema) throw new GameHubError("UNKNOWN_OPERATION", "Unknown game hub operation.", 404);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new GameHubError("INVALID_REQUEST", "Invalid game hub request.", 400, parsed.error.flatten());
  }
  return parsed.data;
}
