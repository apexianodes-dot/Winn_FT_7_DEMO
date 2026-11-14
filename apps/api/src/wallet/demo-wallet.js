const MAX_SAFE_CREDITS = BigInt(Number.MAX_SAFE_INTEGER);

function credits(value) {
  const amount = BigInt(value);
  if (amount < 0n || amount > MAX_SAFE_CREDITS) {
    throw new RangeError("Demo credit amount is outside the supported range.");
  }
  return amount;
}

function asNumber(value) {
  const amount = BigInt(value);
  if (amount < 0n || amount > MAX_SAFE_CREDITS) {
    throw new RangeError("Demo wallet balance is outside the supported range.");
  }
  return Number(amount);
}

function asSignedNumber(value) {
  const amount = BigInt(value);
  if (amount < -MAX_SAFE_CREDITS || amount > MAX_SAFE_CREDITS) {
    throw new RangeError("Demo wallet movement is outside the supported range.");
  }
  return Number(amount);
}

async function writeMovement(client, { userId, cashDelta, bonusDelta, reason, referenceId }) {
  const selected = await client.query(
    `SELECT balance,cash_balance,bonus_balance
     FROM demo_wallets WHERE user_id=$1 FOR UPDATE`,
    [userId]
  );
  if (!selected.rowCount) return null;

  const wallet = selected.rows[0];
  const currentCash = BigInt(wallet.cash_balance);
  const currentBonus = BigInt(wallet.bonus_balance);
  if (currentCash + currentBonus !== BigInt(wallet.balance)) {
    throw new Error("Demo wallet bucket totals do not match the legacy balance.");
  }
  const cash = currentCash + cashDelta;
  const bonus = currentBonus + bonusDelta;
  if (cash < 0n || bonus < 0n) return null;

  const total = cash + bonus;
  const totalDelta = cashDelta + bonusDelta;
  if (totalDelta === 0n) throw new RangeError("A wallet movement must not be zero.");
  const next = asNumber(total);

  await client.query(
    `UPDATE demo_wallets
     SET balance=$2,cash_balance=$3,bonus_balance=$4,updated_at=NOW()
     WHERE user_id=$1`,
    [userId, next, asNumber(cash), asNumber(bonus)]
  );
  await client.query(
    `INSERT INTO demo_ledger(user_id,delta,balance_after,reason,reference_id)
     VALUES($1,$2,$3,$4,$5)`,
    [userId, asSignedNumber(totalDelta), next, reason, referenceId || null]
  );

  return {
    balance: next,
    totalBalance: next,
    cashBalance: asNumber(cash),
    bonusBalance: asNumber(bonus)
  };
}

export async function debitDemoCredits(client, { userId, amount, reason, referenceId = null }) {
  const requested = credits(amount);
  if (requested === 0n) throw new RangeError("A debit amount must be greater than zero.");

  const selected = await client.query(
    `SELECT balance,cash_balance,bonus_balance
     FROM demo_wallets WHERE user_id=$1 FOR UPDATE`,
    [userId]
  );
  if (!selected.rowCount) return null;

  const wallet = selected.rows[0];
  const cash = BigInt(wallet.cash_balance);
  const bonus = BigInt(wallet.bonus_balance);
  if (cash + bonus !== BigInt(wallet.balance)) {
    throw new Error("Demo wallet bucket totals do not match the legacy balance.");
  }
  if (cash + bonus < requested) return null;

  const bonusSpend = bonus < requested ? bonus : requested;
  const cashSpend = requested - bonusSpend;
  const movement = await writeMovement(client, {
    userId,
    cashDelta: -cashSpend,
    bonusDelta: -bonusSpend,
    reason,
    referenceId
  });
  return movement && {
    ...movement,
    cashAmount: asNumber(cashSpend),
    bonusAmount: asNumber(bonusSpend)
  };
}

export async function creditDemoCredits(client, {
  userId,
  cashAmount = 0,
  bonusAmount = 0,
  reason,
  referenceId = null
}) {
  const cash = credits(cashAmount);
  const bonus = credits(bonusAmount);
  if (cash + bonus === 0n) throw new RangeError("A credit amount must be greater than zero.");
  return writeMovement(client, {
    userId,
    cashDelta: cash,
    bonusDelta: bonus,
    reason,
    referenceId
  });
}

export async function getDemoBalance(pool, userId) {
  const result = await pool.query(
    `SELECT balance,cash_balance,bonus_balance
     FROM demo_wallets WHERE user_id=$1`,
    [userId]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  const cashBalance = asNumber(row.cash_balance);
  const bonusBalance = asNumber(row.bonus_balance);
  const balance = asNumber(row.balance);
  if (cashBalance + bonusBalance !== balance) {
    throw new Error("Demo wallet bucket totals do not match the legacy balance.");
  }
  return {
    unit: "DEMO_CREDIT",
    cashBalance,
    bonusBalance,
    totalBalance: balance
  };
}
