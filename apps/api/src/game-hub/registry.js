import { GameHubError, PROVIDER_IDS } from "./contract.js";
import { InternalDemoAdapter } from "./adapters/internal-demo.js";
import { OpenRgsAdapter } from "./adapters/open-rgs.js";
import { VFairGamesAdapter } from "./adapters/vfair-games.js";

export function createProviderRegistry(adapters = [
  new InternalDemoAdapter(),
  new VFairGamesAdapter(),
  new OpenRgsAdapter()
]) {
  const registry = new Map();
  for (const adapter of adapters) {
    if (!PROVIDER_IDS.includes(adapter.providerId) || registry.has(adapter.providerId)) {
      throw new TypeError("Game provider ids must be known and unique.");
    }
    registry.set(adapter.providerId, adapter);
  }

  return Object.freeze({
    get(providerId) {
      const adapter = registry.get(providerId);
      if (!adapter) throw new GameHubError("UNKNOWN_PROVIDER", "Unknown game provider.", 404);
      return adapter;
    },
    list() {
      return [...registry.values()].map(({ providerId, enabled }) => ({ providerId, enabled }));
    }
  });
}
