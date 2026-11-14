---
name: Hybrid game hub scope
description: Project-specific boundaries for preparing a hybrid game integration architecture.
---

WINN FT 7 should remain a demo environment while preparing a future hybrid game architecture. A game/provider integration hub must not grant providers direct database or wallet access; WINN FT 7 retains ownership of the central wallet. Demo balances and bonus amounts must remain distinct concepts in the future design, and no real-money deposits, withdrawals, or wagers are in scope.

**Why:** The user specified these constraints for WINN FT 7 while requesting architecture analysis before implementation.

**How to apply:** Keep current demo games, authentication, balances, and visual design unchanged during architecture preparation. Isolate future provider credentials and callbacks behind server-owned adapters, and require clarification before changing the currently single 10,000-credit balance into separate balance and bonus buckets.
