---
name: Hybrid game hub scope
description: Project-specific boundaries for preparing a hybrid game integration architecture.
---

WINN FT 7 should remain a demo environment while preparing a future hybrid game architecture. A game/provider integration hub must not grant providers direct database or wallet access; WINN FT 7 retains ownership of the central wallet. The confirmed initial amount is 10,000 credits total, with the existing welcome amount attributed to the bonus bucket rather than added on top. Keep base and bonus buckets distinct; in the disabled DEMO hub, consume bonus before base and credit simulated wins to bonus. Do not add real-money deposits, withdrawals, or wagers.

**Why:** The user specified the demo-only and central-wallet constraints, confirmed the 10,000-credit total, and selected the bonus as that existing amount; bonus-first keeps the legacy total stable and the hub remains simulation-only.

**How to apply:** Keep the current UI and game outcomes unchanged. When introducing bonus accounting, classify the existing 10,000 initial credits as bonus and preserve the same total. Providers call only server-owned adapters and wallet services, never PostgreSQL directly.
