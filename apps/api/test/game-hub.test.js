import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { GAME_HUB_API_VERSION, gameHubSchemas } from "../src/game-hub/contract.js";
import { OpenRgsAdapter } from "../src/game-hub/adapters/open-rgs.js";
import { VFairGamesAdapter } from "../src/game-hub/adapters/vfair-games.js";
import { createProviderRegistry } from "../src/game-hub/registry.js";
import { createDatabaseNonceClaimer, signProviderCallback, verifyProviderCallback } from "../src/game-hub/signatures.js";
import { createGameHub } from "../src/game-hub/index.js";
import { pool } from "../src/db.js";

test("v1 contract validates integer demo amounts and request shapes", () => {
  assert.equal(GAME_HUB_API_VERSION, "v1");
  assert.equal(gameHubSchemas.placeBet.safeParse({
    sessionToken: "signed-session",
    idempotencyKey: "bet-key-0001",
    roundId: "round-1",
    amount: 500
  }).success, true);
  assert.equal(gameHubSchemas.placeBet.safeParse({
    sessionToken: "signed-session",
    idempotencyKey: "bet-key-0001",
    roundId: "round-1",
    amount: 500.5
  }).success, false);
  assert.equal(gameHubSchemas.placeBet.safeParse({
    sessionToken: "signed-session",
    idempotencyKey: "bet-key-0001",
    roundId: "round-1",
    amount: 501
  }).success, false);
});

test("providers are disabled and adapter source cannot import database access", async () => {
  const vfair = new VFairGamesAdapter();
  const openRgs = new OpenRgsAdapter();
  await assert.rejects(vfair.launchSession({}), (error) => error.code === "PROVIDER_DISABLED");
  await assert.rejects(openRgs.launchSession({}), (error) => error.code === "PROVIDER_DISABLED");
  await assert.rejects(openRgs.mapWalletOperation("settleSimple"), (error) =>
    error.code === "CAPABILITY_UNSUPPORTED"
  );
  await assert.rejects(openRgs.mapWalletOperation("openComplex"), (error) =>
    error.code === "PROVIDER_DISABLED"
  );
  for (const path of [
    "../src/game-hub/adapters/base.js",
    "../src/game-hub/adapters/internal-demo.js",
    "../src/game-hub/adapters/vfair-games.js",
    "../src/game-hub/adapters/open-rgs.js"
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:db\.js|\/pg)["']/);
  }
});

test("signed callbacks enforce timestamp, body signature, and one-time nonces", async (t) => {
  const providerId = "open-rgs";
  const nonce = randomUUID();
  const secret = "test-only-callback-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = Buffer.from(JSON.stringify({ transaction: "t-1" }));
  const request = { method: "POST", path: "/callbacks/open-rgs/wallet", timestamp, nonce, rawBody };
  const signature = signProviderCallback(secret, request);
  const claimNonce = createDatabaseNonceClaimer(pool);
  t.after(async () => {
    await pool.query(
      "DELETE FROM demo_game_hub.callback_nonces WHERE provider_id=$1 AND nonce=$2",
      [providerId, nonce]
    );
  });

  assert.equal(await verifyProviderCallback({
    providerId, secret, ...request, signature, claimNonce
  }), true);
  await assert.rejects(
    verifyProviderCallback({ providerId, secret, ...request, signature, claimNonce }),
    (error) => error.code === "REPLAYED_CALLBACK"
  );
  await assert.rejects(
    verifyProviderCallback({
      providerId, secret, ...request, rawBody: Buffer.from("tampered"), signature,
      claimNonce: async () => true
    }),
    (error) => error.code === "INVALID_SIGNATURE"
  );
  await assert.rejects(
    verifyProviderCallback({
      providerId, secret, ...request, timestamp: String(Number(timestamp) - 600),
      signature, claimNonce: async () => true
    }),
    (error) => error.code === "STALE_SIGNATURE"
  );
});

test("demo hub is atomic, idempotent, split-balance aware, and session scoped", async (t) => {
  const playerId = randomUUID();
  const phone = `+52888${String(Date.now()).slice(-7)}`;
  const registry = createProviderRegistry();
  const { service, repository } = createGameHub({
    pool,
    registry,
    signingSecret: "test-only-game-hub-secret"
  });
  let session;

  await pool.query(
    `INSERT INTO users(id,phone_e164,display_name,password_hash,phone_verified)
     VALUES($1,$2,'Hub Integration Test','test-hash',TRUE)`,
    [playerId, phone]
  );
  await pool.query(
    `INSERT INTO demo_wallets(user_id,balance,cash_balance,bonus_balance)
     VALUES($1,10000,0,10000)`,
    [playerId]
  );
  await pool.query(
    `INSERT INTO demo_ledger(user_id,delta,balance_after,reason)
     VALUES($1,10000,10000,'signup_demo')`,
    [playerId]
  );
  t.after(async () => {
    await pool.query("DELETE FROM demo_game_hub.transactions WHERE player_id=$1", [playerId]);
    await pool.query("DELETE FROM demo_game_hub.sessions WHERE player_id=$1", [playerId]);
    await pool.query("DELETE FROM demo_ledger WHERE user_id=$1", [playerId]);
    await pool.query("DELETE FROM demo_wallets WHERE user_id=$1", [playerId]);
    await pool.query("DELETE FROM users WHERE id=$1", [playerId]);
    await pool.end();
  });

  session = await service.launchSession({
    playerId,
    providerId: "internal-demo",
    gameId: "hub-contract-fixture"
  });
  assert.equal(session.environment, "DEMO");
  assert.equal(session.launchUrl, null);
  assert.deepEqual(await service.getBalance({ sessionToken: session.sessionToken }), {
    unit: "DEMO_CREDIT",
    cashBalance: 0,
    bonusBalance: 10000,
    totalBalance: 10000
  });

  const betInput = {
    sessionToken: session.sessionToken,
    idempotencyKey: "test-bet-idempotency-01",
    externalTransactionId: "test-external-bet-01",
    roundId: "test-round-01",
    amount: 500
  };
  const bet = await service.placeBet(betInput);
  assert.equal(bet.wallet.totalBalance, 9500);
  assert.equal(bet.wallet.bonusBalance, 9500);
  const concurrentReplay = await Promise.all([
    service.placeBet(betInput),
    service.placeBet(betInput)
  ]);
  assert.deepEqual(concurrentReplay, [bet, bet]);
  await assert.rejects(
    service.placeBet({ ...betInput, amount: 400 }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT"
  );

  const refunded = await service.refundBet({
    sessionToken: session.sessionToken,
    idempotencyKey: "test-refund-idempotency-1",
    betTransactionId: bet.transactionId
  });
  assert.equal(refunded.status, "refunded");
  assert.equal(refunded.wallet.totalBalance, 10000);
  assert.equal(refunded.wallet.bonusBalance, 10000);
  assert.equal((await service.getTransaction({
    sessionToken: session.sessionToken,
    transactionId: bet.transactionId
  })).status, "refunded");

  const fixtureClient = await pool.connect();
  try {
    await fixtureClient.query("BEGIN");
    await fixtureClient.query(
      `UPDATE demo_wallets SET balance=500,cash_balance=300,bonus_balance=200
       WHERE user_id=$1`,
      [playerId]
    );
    await fixtureClient.query(
      `INSERT INTO demo_ledger(user_id,delta,balance_after,reason)
       VALUES($1,-9500,500,'test_fixture_split')`,
      [playerId]
    );
    await fixtureClient.query("COMMIT");
  } catch (error) {
    await fixtureClient.query("ROLLBACK");
    throw error;
  } finally {
    fixtureClient.release();
  }
  const splitBet = await service.placeBet({
    sessionToken: session.sessionToken,
    idempotencyKey: "split-bet-idempotency-01",
    roundId: "split-round-01",
    amount: 350
  });
  assert.equal(splitBet.wallet.bonusBalance, 0);
  assert.equal(splitBet.wallet.cashBalance, 150);
  const splitRefund = await service.refundBet({
    sessionToken: session.sessionToken,
    idempotencyKey: "split-refund-idempotency-01",
    betTransactionId: splitBet.transactionId
  });
  assert.equal(splitRefund.wallet.bonusBalance, 200);
  assert.equal(splitRefund.wallet.cashBalance, 300);
  assert.equal(splitRefund.wallet.totalBalance, 500);

  const winningBet = await service.placeBet({
    sessionToken: session.sessionToken,
    idempotencyKey: "winning-bet-idempotency-1",
    roundId: "winning-round-1",
    amount: 100
  });
  const win = await service.settleWin({
    sessionToken: session.sessionToken,
    idempotencyKey: "settle-win-idempotency-01",
    betTransactionId: winningBet.transactionId,
    amount: 250
  });
  assert.equal(win.wallet.totalBalance, 650);
  assert.equal(win.wallet.bonusBalance, 350);
  await assert.rejects(
    service.refundBet({
      sessionToken: session.sessionToken,
      idempotencyKey: "refund-settled-bet-001",
      betTransactionId: winningBet.transactionId
    }),
    (error) => error.code === "BET_NOT_REFUNDABLE"
  );

  const marked = await service.markForReconciliation(win.transactionId, "Provider acknowledgement was ambiguous.");
  assert.equal(marked.status, "reconciliation_required");
  assert.equal((await service.getTransaction({
    sessionToken: session.sessionToken,
    transactionId: win.transactionId
  })).status, "reconciliation_required");

  const beforeInsufficient = await pool.query(
    "SELECT COUNT(*)::int AS count FROM demo_game_hub.transactions WHERE player_id=$1",
    [playerId]
  );
  const lowWallet = await pool.connect();
  try {
    await lowWallet.query("BEGIN");
    await lowWallet.query(
      `UPDATE demo_wallets SET balance=40,cash_balance=0,bonus_balance=40
       WHERE user_id=$1`,
      [playerId]
    );
    await lowWallet.query(
      `INSERT INTO demo_ledger(user_id,delta,balance_after,reason)
       VALUES($1,-610,40,'test_fixture_low_balance')`,
      [playerId]
    );
    await lowWallet.query("COMMIT");
  } catch (error) {
    await lowWallet.query("ROLLBACK");
    throw error;
  } finally {
    lowWallet.release();
  }
  await assert.rejects(
    service.placeBet({
      sessionToken: session.sessionToken,
      idempotencyKey: "insufficient-bet-idem-1",
      roundId: "insufficient-round-1",
      amount: 50
    }),
    (error) => error.code === "INSUFFICIENT_BALANCE"
  );
  const afterInsufficient = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM demo_game_hub.transactions WHERE player_id=$1) AS tx_count,
            (SELECT balance FROM demo_wallets WHERE user_id=$1) AS balance,
            (SELECT SUM(delta) FROM demo_ledger WHERE user_id=$1) AS ledger_total`,
    [playerId]
  );
  assert.equal(afterInsufficient.rows[0].tx_count, beforeInsufficient.rows[0].count);
  assert.equal(Number(afterInsufficient.rows[0].balance), 40);
  assert.equal(Number(afterInsufficient.rows[0].ledger_total), 40);

  await service.closeSession({ sessionToken: session.sessionToken });
  await assert.rejects(
    service.getBalance({ sessionToken: session.sessionToken }),
    (error) => error.code === "INVALID_GAME_SESSION"
  );
  await assert.rejects(
    service.launchSession({ playerId, providerId: "vfair-games", gameId: "not-enabled" }),
    (error) => error.code === "PROVIDER_DISABLED"
  );

  const finalWallet = await pool.query(
    "SELECT balance,cash_balance,bonus_balance FROM demo_wallets WHERE user_id=$1",
    [playerId]
  );
  assert.equal(Number(finalWallet.rows[0].balance), 40);
  assert.equal(Number(finalWallet.rows[0].balance),
    Number(finalWallet.rows[0].cash_balance) + Number(finalWallet.rows[0].bonus_balance));
  const accounting = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE amount <> cash_amount + bonus_amount)::int AS split_errors,
            (SELECT SUM(delta) FROM demo_ledger WHERE user_id=$1)::bigint AS ledger_total
     FROM demo_game_hub.transactions WHERE player_id=$1`,
    [playerId]
  );
  assert.equal(accounting.rows[0].split_errors, 0);
  assert.equal(Number(accounting.rows[0].ledger_total), 40);

  const sessionRow = await repository.getSession(session.sessionId);
  assert.equal(sessionRow.status, "closed");
  assert.equal(sessionRow.environment, "DEMO");
});
