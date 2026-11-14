import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "./db.js";
import { requireAuth, requireAdmin } from "./auth.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: false }));
app.use(express.json({ limit: "20kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 120 }));

const phoneSchema = z.string().regex(/^\+52\d{10}$/, "Usa +52 y 10 dígitos");
const passwordSchema = z.string().min(10).max(72);
const tokenFor = (user) => jwt.sign(
  { sub: user.id, role: user.role, name: user.display_name },
  process.env.JWT_SECRET,
  { expiresIn: "2h" }
);

app.get("/api/health", (_req, res) => res.json({ ok: true, product: "WINN FT 7", mode: "DEMO" }));

app.post("/api/auth/register", async (req, res) => {
  const schema = z.object({
    phone: phoneSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(2).max(40)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const inserted = await client.query(
      `INSERT INTO users(phone_e164, display_name, password_hash)
       VALUES($1,$2,$3) RETURNING id, phone_e164, display_name, role`,
      [parsed.data.phone, parsed.data.displayName, passwordHash]
    );
    const user = inserted.rows[0];
    await client.query("INSERT INTO demo_wallets(user_id,balance) VALUES($1,10000)", [user.id]);
    await client.query(
      "INSERT INTO demo_ledger(user_id,delta,balance_after,reason) VALUES($1,10000,10000,'signup_demo')",
      [user.id]
    );
    await client.query("COMMIT");

    // OTP fijo exclusivamente para desarrollo local. Sustituir por SMS real + hash + expiración.
    const response = { message: "Cuenta demo creada. Verifica tu teléfono.", userId: user.id };
    if (process.env.NODE_ENV === "development") response.demoVerificationCode = "123456";
    res.status(201).json(response);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return res.status(409).json({ error: "El teléfono ya está registrado" });
    console.error("register_error", err.message);
    res.status(500).json({ error: "No se pudo crear la cuenta" });
  } finally {
    client.release();
  }
});

app.post("/api/auth/verify-demo", async (req, res) => {
  if (process.env.NODE_ENV !== "development") return res.status(404).json({ error: "No disponible" });
  const parsed = z.object({ userId: z.string().uuid(), code: z.literal("123456") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Código inválido" });
  const result = await pool.query(
    "UPDATE users SET phone_verified=TRUE WHERE id=$1 RETURNING id, display_name, role",
    [parsed.data.userId]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json({ token: tokenFor(result.rows[0]), user: result.rows[0], mode: "DEMO" });
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = z.object({ phone: phoneSchema, password: z.string().min(1).max(72) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos" });
  const result = await pool.query(
    "SELECT id, phone_e164, display_name, password_hash, phone_verified, role, status FROM users WHERE phone_e164=$1",
    [parsed.data.phone]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash)))
    return res.status(401).json({ error: "Celular o contraseña incorrectos" });
  if (!user.phone_verified) return res.status(403).json({ error: "Verifica tu teléfono primero" });
  if (user.status !== "active") return res.status(403).json({ error: "Cuenta suspendida" });
  res.json({ token: tokenFor(user), user: { id: user.id, display_name: user.display_name, role: user.role }, mode: "DEMO" });
});

app.get("/api/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT u.id,u.phone_e164,u.display_name,u.phone_verified,w.balance
     FROM users u JOIN demo_wallets w ON w.user_id=u.id WHERE u.id=$1`,
    [req.auth.sub]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json({ ...result.rows[0], mode: "DEMO" });
});

app.post("/api/demo/round", requireAuth, async (req, res) => {
  const parsed = z.object({
    game: z.enum(["slots_demo", "roulette_demo", "blackjack_demo"]),
    credits: z.number().int().min(10).max(500)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Ronda inválida" });

  // Simulación de coste fijo, sin RNG de premios ni conversión a dinero.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const wallet = await client.query(
      "SELECT balance FROM demo_wallets WHERE user_id=$1 FOR UPDATE", [req.auth.sub]
    );
    if (!wallet.rowCount || wallet.rows[0].balance < parsed.data.credits) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Créditos demo insuficientes" });
    }
    const next = wallet.rows[0].balance - parsed.data.credits;
    await client.query(
      "UPDATE demo_wallets SET balance=$2,updated_at=NOW() WHERE user_id=$1",
      [req.auth.sub, next]
    );
    await client.query(
      "INSERT INTO demo_ledger(user_id,delta,balance_after,reason) VALUES($1,$2,$3,$4)",
      [req.auth.sub, -parsed.data.credits, next, parsed.data.game]
    );
    let outcome;
    if (parsed.data.game === "slots_demo") {
      const symbols = ["🍒", "⭐", "🔔", "🍀", "💎", "7️⃣"];
      const reels = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
      const matched = reels.every((symbol) => symbol === reels[0]);
      outcome = {
        visual: reels.join("  "),
        title: matched ? "¡Tres símbolos iguales!" : "Giro completado",
        description: "Resultado visual de práctica. No se generan premios ni créditos."
      };
    } else if (parsed.data.game === "roulette_demo") {
      const number = Math.floor(Math.random() * 37);
      outcome = {
        visual: `${number === 0 ? "🟢" : number % 2 ? "🔴" : "⚫"} ${number}`,
        title: "La ruleta se ha detenido",
        description: "Resultado aleatorio de práctica, sin premios ni pagos."
      };
    } else {
      const player = 12 + Math.floor(Math.random() * 10);
      const dealer = 12 + Math.floor(Math.random() * 10);
      outcome = {
        visual: `🃏 ${player}  ·  ${dealer} 🂠`,
        title: player > dealer ? "Gana la mano de práctica" : player === dealer ? "Mano empatada" : "El dealer gana esta mano",
        description: "Mano simulada. No se generan premios ni créditos."
      };
    }
    await client.query("COMMIT");
    res.json({ balance: next, result: "Ronda demo registrada", outcome, mode: "DEMO" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("demo_round_error", err.message);
    res.status(500).json({ error: "No se pudo registrar la ronda" });
  } finally {
    client.release();
  }
});

app.get("/api/demo/history", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id,delta,balance_after,reason,created_at
     FROM demo_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.auth.sub]
  );
  res.json({ entries: result.rows, mode: "DEMO" });
});

app.get("/api/admin/overview", requireAuth, requireAdmin, async (_req, res) => {
  const [users, verified, credits] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total FROM users"),
    pool.query("SELECT COUNT(*)::int AS total FROM users WHERE phone_verified=TRUE"),
    pool.query("SELECT COALESCE(SUM(balance),0)::bigint AS total FROM demo_wallets")
  ]);
  res.json({
    mode: "DEMO",
    users: users.rows[0].total,
    verifiedUsers: verified.rows[0].total,
    demoCreditsInCirculation: Number(credits.rows[0].total)
  });
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const result = await pool.query(
    `SELECT u.id,u.phone_e164,u.display_name,u.status,u.created_at,w.balance
     FROM users u JOIN demo_wallets w ON w.user_id=u.id ORDER BY u.created_at DESC LIMIT 200`
  );
  res.json({ users: result.rows, mode: "DEMO" });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`WINN FT 7 DEMO API listening on ${port}`));
