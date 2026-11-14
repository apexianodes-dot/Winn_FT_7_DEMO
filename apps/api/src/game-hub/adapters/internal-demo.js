import { GameProviderAdapter } from "./base.js";

export class InternalDemoAdapter extends GameProviderAdapter {
  constructor() {
    super({ providerId: "internal-demo", enabled: true });
  }

  async launchSession({ sessionId, gameId }) {
    return {
      providerSessionId: sessionId,
      gameId,
      launchUrl: null,
      status: "prepared"
    };
  }
}
