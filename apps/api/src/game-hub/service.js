import { createHash, createHmac, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { jwtSecret } from "../auth.js";
import { creditDemoCredits, debitDemoCredits, getDemoBalance } from "../wallet/demo-wallet.js";
import {
  DEMO_CREDIT_UNIT,
  GameHubError,
  parseHubInput
} from "./contract.js";

const SESSION_ISSUER = "winn-ft7-demo";
const SESSION_AUDIENCE = "winn-game-hub-v1";
const SESSION_LIFETIME_SECONDS = 10 * 60;

function sessionSigningKey(secret) {
  return createHmac("sha256", secret).update("winn-ft7:game-hub-session:v1").digest();
}

function safeNumber(value) {
  const amount = BigInt(value);
  if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new GameHubError("AMOUNT_OUT_OF_RANGE", "Credit amount is outside the supported range.", 400);
  }
  return Number(amount);
}

function requestHash(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function sessionAuthError() {
  return new GameHubError("INVALID_GAME_SESSION", "Game session is invalid or expired.", 401);
}

export class GameHubService {
  constructor({ repository, pool, registry, signingSecret = jwtSecret }) {
    if (!repository || !pool || !registry || !signingSecret) {
      throw new TypeError("GameHubService requires a repository, wallet pool, provider registry, and signing secret.");
    }
    this.repository = repository;
    this.pool = pool;
    this.registry = registry;
    this.signingKey = sessionSigningKey(signingSecret);
  }

  async launchSession(input) {
    const { playerId, ...launchRequest } = input || {};
    const data = parseHubInput("launchSession", launchRequest);
    const player = z.string().uuid().safeParse(playerId);
    if (!player.success) {
      throw new GameHubError("INVALID_REQUEST", "A verified player id is required.", 400);
    }
    const adapter = this.registry.get(data.providerId);
    adapter.assertEnabled();

    const sessionId = randomUUID();
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);
    const token = jwt.sign(
      {
        sid: sessionId,
        pid: data.providerId,
        gid: data.gameId,
        mode: "DEMO"
      },
      this.signingKey,
      {
        issuer: SESSION_ISSUER,
        audience: SESSION_AUDIENCE,
        subject: player.data,
        jwtid: jti,
        expiresIn: SESSION_LIFETIME_SECONDS
      }
    );

    await this.repository.createSession({
      id: sessionId,
      playerId: player.data,
      providerId: data.providerId,
      gameId: data.gameId,
      jti,
      expiresAt
    });

    try {
      const launched = await adapter.launchSession({
        sessionId,
        gameId: data.gameId,
        locale: data.locale,
        environment: "DEMO"
      });
      return {
        sessionId,
        sessionToken: token,
        providerId: data.providerId,
        gameId: data.gameId,
        environment: "DEMO",
        unit: DEMO_CREDIT_UNIT,
        expiresAt: expiresAt.toISOString(),
        launchUrl: launched.launchUrl
      };
    } catch (error) {
      await this.repository.failSession(sessionId);
      throw error;
    }
  }

  async #sessionForToken(token) {
    let claims;
    try {
      claims = jwt.verify(token, this.signingKey, {
        issuer: SESSION_ISSUER,
        audience: SESSION_AUDIENCE
      });
    } catch {
      throw sessionAuthError();
    }
    if (claims.mode !== "DEMO" || !claims.sid || !claims.pid || !claims.sub || !claims.jti) {
      throw sessionAuthError();
    }
    const session = await this.repository.getSession(claims.sid);
    if (!session ||
        session.status !== "open" ||
        session.environment !== "DEMO" ||
        session.player_id !== claims.sub ||
        session.provider_id !== claims.pid ||
        session.game_id !== claims.gid ||
        session.token_jti !== claims.jti ||
        new Date(session.expires_at).getTime() <= Date.now()) {
      throw sessionAuthError();
    }
    return session;
  }

  async getBalance(input) {
    const data = parseHubInput("getBalance", input);
    const session = await this.#sessionForToken(data.sessionToken);
    const wallet = await getDemoBalance(this.pool, session.player_id);
    if (!wallet) throw new GameHubError("WALLET_NOT_FOUND", "Demo wallet not found.", 404);
    return wallet;
  }

  async #runMoneyOperation(operation, input, apply) {
    const data = parseHubInput(operation, input);
    const session = await this.#sessionForToken(data.sessionToken);
    const referenceId = data.betTransactionId || null;
    const payload = {
      operation,
      sessionId: session.id,
      playerId: session.player_id,
      amount: data.amount ?? null,
      roundId: data.roundId ?? null,
      betTransactionId: referenceId,
      externalTransactionId: data.externalTransactionId ?? null
    };
    const hash = requestHash(payload);

    try {
      return await this.repository.transaction(async (client) => {
        const lockedSession = await client.query(
          `SELECT id,player_id,provider_id,status,environment,expires_at
           FROM demo_game_hub.sessions WHERE id=$1 FOR UPDATE`,
          [session.id]
        );
        const currentSession = lockedSession.rows[0];
        if (!currentSession ||
            currentSession.status !== "open" ||
            currentSession.environment !== "DEMO" ||
            new Date(currentSession.expires_at).getTime() <= Date.now()) {
          throw sessionAuthError();
        }

        const inserted = await client.query(
          `INSERT INTO demo_game_hub.transactions
           (player_id,session_id,provider_id,operation,idempotency_key,request_hash,
            external_transaction_id,reference_transaction_id,amount,cash_amount,bonus_amount,status,response)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,'committed','{}'::jsonb)
           ON CONFLICT(provider_id,operation,idempotency_key) DO NOTHING
           RETURNING id`,
          [
            session.player_id, session.id, session.provider_id, operation, data.idempotencyKey,
            hash, data.externalTransactionId || null, referenceId,
            safeNumber(data.amount ?? 1)
          ]
        );
        if (!inserted.rowCount) {
          const prior = await client.query(
            `SELECT request_hash,response FROM demo_game_hub.transactions
             WHERE provider_id=$1 AND operation=$2 AND idempotency_key=$3`,
            [session.provider_id, operation, data.idempotencyKey]
          );
          if (!prior.rowCount || prior.rows[0].request_hash !== hash) {
            throw new GameHubError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request.", 409);
          }
          return prior.rows[0].response;
        }

        const transactionId = inserted.rows[0].id;
        const result = await apply(client, { data, session, transactionId });
        const response = {
          transactionId,
          operation,
          status: result.status,
          amount: result.amount,
          unit: DEMO_CREDIT_UNIT,
          wallet: result.wallet,
          referenceTransactionId: referenceId
        };
        await client.query(
          `UPDATE demo_game_hub.transactions
           SET amount=$2,cash_amount=$3,bonus_amount=$4,status=$5,response=$6::jsonb,
               updated_at=NOW()
           WHERE id=$1`,
          [
            transactionId,
            result.amount,
            result.cashAmount,
            result.bonusAmount,
            result.status,
            JSON.stringify(response)
          ]
        );
        return response;
      });
    } catch (error) {
      if (error.code === "23505") {
        throw new GameHubError("TRANSACTION_CONFLICT", "This provider transaction has already been processed.", 409);
      }
      throw error;
    }
  }

  async placeBet(input) {
    return this.#runMoneyOperation("placeBet", input, async (client, { data, session, transactionId }) => {
      const wallet = await debitDemoCredits(client, {
        userId: session.player_id,
        amount: data.amount,
        reason: "hub_place_bet",
        referenceId: transactionId
      });
      if (!wallet) throw new GameHubError("INSUFFICIENT_BALANCE", "Insufficient demo credits.", 400);
      return {
        amount: data.amount,
        status: "committed",
        cashAmount: wallet.cashAmount,
        bonusAmount: wallet.bonusAmount,
        wallet
      };
    });
  }

  async settleWin(input) {
    return this.#runMoneyOperation("settleWin", input, async (client, { data, session, transactionId }) => {
      const bet = await client.query(
        `SELECT id,player_id,session_id,provider_id,status
         FROM demo_game_hub.transactions
         WHERE id=$1 AND operation='placeBet' FOR UPDATE`,
        [data.betTransactionId]
      );
      if (!bet.rowCount ||
          bet.rows[0].player_id !== session.player_id ||
          bet.rows[0].session_id !== session.id ||
          bet.rows[0].provider_id !== session.provider_id ||
          bet.rows[0].status !== "committed") {
        throw new GameHubError("BET_NOT_SETTLEABLE", "Bet is not available for settlement.", 409);
      }
      const wallet = await creditDemoCredits(client, {
        userId: session.player_id,
        bonusAmount: data.amount,
        reason: "hub_settle_win",
        referenceId: transactionId
      });
      await client.query(
        `UPDATE demo_game_hub.transactions SET status='settled',updated_at=NOW() WHERE id=$1`,
        [data.betTransactionId]
      );
      return {
        amount: data.amount,
        status: "settled",
        cashAmount: 0,
        bonusAmount: data.amount,
        wallet
      };
    });
  }

  async refundBet(input) {
    return this.#runMoneyOperation("refundBet", input, async (client, { data, session, transactionId }) => {
      const bet = await client.query(
        `SELECT id,player_id,session_id,provider_id,status,cash_amount,bonus_amount,amount
         FROM demo_game_hub.transactions
         WHERE id=$1 AND operation='placeBet' FOR UPDATE`,
        [data.betTransactionId]
      );
      if (!bet.rowCount ||
          bet.rows[0].player_id !== session.player_id ||
          bet.rows[0].session_id !== session.id ||
          bet.rows[0].provider_id !== session.provider_id ||
          bet.rows[0].status !== "committed") {
        throw new GameHubError("BET_NOT_REFUNDABLE", "Bet is not available for refund.", 409);
      }
      const cashAmount = safeNumber(bet.rows[0].cash_amount);
      const bonusAmount = safeNumber(bet.rows[0].bonus_amount);
      const amount = safeNumber(bet.rows[0].amount);
      const wallet = await creditDemoCredits(client, {
        userId: session.player_id,
        cashAmount,
        bonusAmount,
        reason: "hub_refund_bet",
        referenceId: transactionId
      });
      await client.query(
        `UPDATE demo_game_hub.transactions SET status='refunded',updated_at=NOW() WHERE id=$1`,
        [data.betTransactionId]
      );
      return { amount, status: "refunded", cashAmount, bonusAmount, wallet };
    });
  }

  async getTransaction(input) {
    const data = parseHubInput("getTransaction", input);
    const session = await this.#sessionForToken(data.sessionToken);
    const result = await this.pool.query(
      `SELECT id,operation,amount,cash_amount,bonus_amount,status,response,
              reference_transaction_id,created_at,updated_at,reconciliation_reason
       FROM demo_game_hub.transactions
       WHERE id=$1 AND session_id=$2 AND player_id=$3 AND provider_id=$4`,
      [data.transactionId, session.id, session.player_id, session.provider_id]
    );
    if (!result.rowCount) throw new GameHubError("TRANSACTION_NOT_FOUND", "Transaction not found.", 404);
    return result.rows[0];
  }

  async closeSession(input) {
    const data = parseHubInput("closeSession", input);
    const session = await this.#sessionForToken(data.sessionToken);
    const adapter = this.registry.get(session.provider_id);
    await adapter.closeSession({ sessionId: session.id });
    const result = await this.pool.query(
      `UPDATE demo_game_hub.sessions SET status='closed',closed_at=NOW()
       WHERE id=$1 AND status='open'
       RETURNING id`,
      [session.id]
    );
    return { sessionId: session.id, status: "closed" };
  }

  async markForReconciliation(transactionId, reason) {
    if (typeof reason !== "string" || !reason.trim() || reason.length > 500) {
      throw new GameHubError("INVALID_RECONCILIATION_REASON", "A short reconciliation reason is required.", 400);
    }
    const updated = await this.repository.markReconciliationRequired(transactionId, reason.trim());
    if (!updated) throw new GameHubError("TRANSACTION_NOT_FOUND", "Transaction not found or not reconcilable.", 404);
    return updated;
  }
}
