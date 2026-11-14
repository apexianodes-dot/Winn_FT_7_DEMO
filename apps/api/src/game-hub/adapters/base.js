import { GameHubError } from "../contract.js";

export class GameProviderAdapter {
  constructor({ providerId, enabled = false }) {
    this.providerId = providerId;
    this.enabled = enabled;
  }

  assertEnabled() {
    if (!this.enabled) {
      throw new GameHubError("PROVIDER_DISABLED", "This game provider is not enabled.", 503);
    }
  }

  async launchSession() {
    this.assertEnabled();
    throw new GameHubError("CAPABILITY_UNSUPPORTED", "Provider launch is not configured.", 501);
  }

  async closeSession() {
    this.assertEnabled();
    return { closed: true };
  }
}
