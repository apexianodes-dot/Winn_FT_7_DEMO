export class GameHubRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(session) {
    await this.pool.query(
      `INSERT INTO demo_game_hub.sessions
       (id,player_id,provider_id,game_id,environment,status,token_jti,expires_at)
       VALUES($1,$2,$3,$4,'DEMO','open',$5,$6)`,
      [session.id, session.playerId, session.providerId, session.gameId, session.jti, session.expiresAt]
    );
  }

  async getSession(sessionId) {
    const result = await this.pool.query(
      `SELECT id,player_id,provider_id,game_id,environment,status,token_jti,expires_at
       FROM demo_game_hub.sessions WHERE id=$1`,
      [sessionId]
    );
    return result.rows[0] || null;
  }

  async failSession(sessionId) {
    await this.pool.query(
      `UPDATE demo_game_hub.sessions SET status='failed',closed_at=NOW()
       WHERE id=$1 AND status='open'`,
      [sessionId]
    );
  }

  async markReconciliationRequired(transactionId, reason) {
    const result = await this.pool.query(
      `UPDATE demo_game_hub.transactions
       SET status='reconciliation_required',
           response=jsonb_set(response,'{status}','"reconciliation_required"'::jsonb),
           reconciliation_reason=$2,updated_at=NOW()
       WHERE id=$1 AND status IN ('committed','settled')
       RETURNING id,status,reconciliation_reason`,
      [transactionId, reason]
    );
    return result.rows[0] || null;
  }
}
