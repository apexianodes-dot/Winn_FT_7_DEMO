import { GameProviderAdapter } from "./base.js";

/**
 * Disabled boundary for the vFair partner-wallet integration.
 * Wire formats and callback paths are intentionally not guessed from the
 * public product README; enable only against a confirmed partner spec.
 */
export class VFairGamesAdapter extends GameProviderAdapter {
  constructor() {
    super({ providerId: "vfair-games", enabled: false });
  }
}
