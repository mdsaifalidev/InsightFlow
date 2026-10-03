import { setupServer } from "msw/node"

import { handlers } from "./handlers"

/** MSW for Node (Vitest). The browser uses ./browser.ts. */
export const server = setupServer(...handlers)
