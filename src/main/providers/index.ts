import { ClaudeAgentProvider } from './ClaudeAgentProvider'
import type { AgentProvider } from './types'

export type { AgentProvider, AgentQueryOptions, HistoryTurn } from './types'

/** Registry of available agent-provider strategies, keyed by id. Adding a new
 *  backend (a different model vendor, a local model, a test double) means
 *  writing one class that implements `AgentProvider` and registering it here —
 *  nothing else in the app needs to change. */
const providers = new Map<string, AgentProvider>([['claude', new ClaudeAgentProvider()]])

const DEFAULT_PROVIDER_ID = 'claude'

/** Selects the provider strategy for a session. No per-agent provider selection
 *  exists in the UI yet, so this always resolves to the default — but every call
 *  site already goes through this seam instead of constructing `ClaudeAgentProvider`
 *  directly, so wiring up per-project/per-agent provider choice later is additive. */
export function getAgentProvider(id: string = DEFAULT_PROVIDER_ID): AgentProvider {
  const provider = providers.get(id)
  if (!provider) throw new Error(`Unknown agent provider "${id}"`)
  return provider
}
