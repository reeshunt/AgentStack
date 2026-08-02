import type { AgentStackApi } from './index'

declare global {
  interface Window {
    agentstack: AgentStackApi
  }
}
