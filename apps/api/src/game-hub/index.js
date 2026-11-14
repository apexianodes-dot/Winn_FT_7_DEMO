import { jwtSecret } from "../auth.js";
import { createProviderRegistry } from "./registry.js";
import { GameHubRepository } from "./repository.js";
import { GameHubService } from "./service.js";

export function createGameHub({ pool, registry = createProviderRegistry(), signingSecret = jwtSecret }) {
  const repository = new GameHubRepository(pool);
  const service = new GameHubService({ repository, pool, registry, signingSecret });
  return Object.freeze({ repository, registry, service });
}
