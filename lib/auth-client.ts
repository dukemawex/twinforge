import { createAuthClient } from "better-auth/react"

// Same-origin in the browser so the session cookie is set on this domain.
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
})
