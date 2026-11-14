import express from "express";
import { GameHubError } from "./contract.js";

function sessionToken(req) {
  const header = req.get("authorization") || "";
  return header.startsWith("GameSession ") ? header.slice("GameSession ".length) : "";
}

function handler(callback, successStatus = 200) {
  return async (req, res, next) => {
    try {
      const result = await callback(req);
      res.status(successStatus).json(result);
    } catch (error) {
      if (error instanceof GameHubError) {
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
          ...(error.details ? { details: error.details } : {})
        });
      }
      next(error);
    }
  };
}

/**
 * Contract routes are deliberately not mounted by server.js. They can be
 * mounted only after the provider review and activation task is approved.
 */
export function createGameHubRouter({ service, requireAuth }) {
  if (!service || typeof requireAuth !== "function") {
    throw new TypeError("The game hub router requires a service and player-auth middleware.");
  }
  const router = express.Router();

  router.post("/sessions", requireAuth, handler(
    (req) => service.launchSession({
      ...req.body,
      playerId: req.auth.sub
    }),
    201
  ));
  router.get("/session/balance", handler(
    (req) => service.getBalance({ sessionToken: sessionToken(req) })
  ));
  router.post("/session/bets", handler(
    (req) => service.placeBet({ ...req.body, sessionToken: sessionToken(req) }),
    201
  ));
  router.post("/session/wins", handler(
    (req) => service.settleWin({ ...req.body, sessionToken: sessionToken(req) }),
    201
  ));
  router.post("/session/refunds", handler(
    (req) => service.refundBet({ ...req.body, sessionToken: sessionToken(req) }),
    201
  ));
  router.get("/transactions/:transactionId", handler(
    (req) => service.getTransaction({
      transactionId: req.params.transactionId,
      sessionToken: sessionToken(req)
    })
  ));
  router.delete("/session", handler(
    (req) => service.closeSession({ sessionToken: sessionToken(req) })
  ));

  return router;
}
