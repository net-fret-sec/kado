// Configure Zod before shared schemas are constructed: CSP forbids eval/JIT.
// Configure Zod before shared schemas are constructed. Its JIT/eval probe is
// incompatible with the production CSP; Node's server configuration is unchanged.
import { z } from 'zod/v4'
z.config({ jitless: true })
export * from 'zod/v4'
