import { GameHubError } from "../contract.js";
import { GameProviderAdapter } from "./base.js";

/**
 * Disabled boundary for open-rgs' PlatformAdapter contract. The RGS itself
 * is not installed or started by this application.
 */
export class OpenRgsAdapter extends GameProviderAdapter {
  constructor() {
    super({ providerId: "open-rgs", enabled: false });
    this.capabilities = Object.freeze({
      openSession: true,
      openComplex: true,
      closeComplex: true,
      settleSimple: false,
      updateComplex: false
    });
  }

  async mapWalletOperation(operation) {
    if (!this.capabilities[operation]) {
      throw new GameHubError(
        "CAPABILITY_UNSUPPORTED",
        "This Open RGS wallet operation has no safe WINN contract mapping.",
        501
      );
    }
    this.assertEnabled();
    throw new GameHubError("PROVIDER_DISABLED", "Open RGS is not connected.", 503);
  }
}
