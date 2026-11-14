import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { GameHubError } from "./contract.js";

const DEFAULT_TOLERANCE_SECONDS = 300;

function bytes(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");
}

export function canonicalCallbackMessage({ method, path, timestamp, nonce, rawBody }) {
  const bodyHash = createHash("sha256").update(bytes(rawBody)).digest("hex");
  return `${timestamp}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash}`;
}

export function signProviderCallback(secret, request) {
  return createHmac("sha256", secret)
    .update(canonicalCallbackMessage(request))
    .digest("hex");
}

export async function verifyProviderCallback({
  providerId,
  secret,
  method,
  path,
  timestamp,
  nonce,
  signature,
  rawBody,
  claimNonce,
  now = Date.now(),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS
}) {
  if (!secret || !nonce || nonce.length > 128 || !/^\d{10}$/.test(String(timestamp))) {
    throw new GameHubError("INVALID_SIGNATURE", "Provider signature headers are invalid.", 401);
  }
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > toleranceSeconds) {
    throw new GameHubError("STALE_SIGNATURE", "Provider signature is outside the allowed time window.", 401);
  }
  if (!/^[a-f0-9]{64}$/i.test(signature || "")) {
    throw new GameHubError("INVALID_SIGNATURE", "Provider signature is invalid.", 401);
  }

  const expected = Buffer.from(signProviderCallback(secret, {
    method, path, timestamp: String(timestamp), nonce, rawBody
  }), "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new GameHubError("INVALID_SIGNATURE", "Provider signature is invalid.", 401);
  }
  if (typeof claimNonce !== "function" || !(await claimNonce(providerId, nonce, seconds + toleranceSeconds))) {
    throw new GameHubError("REPLAYED_CALLBACK", "Provider callback nonce has already been used.", 409);
  }
  return true;
}

export function createDatabaseNonceClaimer(pool) {
  return async (providerId, nonce, expiresAt) => {
    const result = await pool.query(
      `INSERT INTO demo_game_hub.callback_nonces(provider_id,nonce,expires_at)
       VALUES($1,$2,to_timestamp($3))
       ON CONFLICT(provider_id,nonce) DO UPDATE
       SET expires_at=EXCLUDED.expires_at
       WHERE demo_game_hub.callback_nonces.expires_at <= NOW()
       RETURNING nonce`,
      [providerId, nonce, expiresAt]
    );
    return result.rowCount === 1;
  };
}
