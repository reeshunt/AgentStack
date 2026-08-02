import { useEffect, useState } from 'react'
import type { QuotaInfo } from '../../../shared/types'

function formatResetsIn(resetsAt: number, now: number): string {
  const ms = resetsAt - now
  if (ms <= 0) return 'resets shortly'
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `resets in ${hours}h ${minutes}m`
  return `resets in ${minutes}m`
}

export default function QuotaBadge({ quota }: { quota: QuotaInfo | null }): React.JSX.Element | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!quota || quota.utilization == null) return null

  const percent = Math.round(quota.utilization * 100)
  const level =
    quota.status === 'rejected' ? 'over' : quota.status === 'allowed_warning' ? 'warning' : 'ok'

  return (
    <span className={`quota-badge quota-${level}`} title={quota.rateLimitType ?? 'usage'}>
      <span className="quota-icon">⚡</span>
      <span className="quota-percent">{percent}%</span>
      {quota.resetsAt && <span className="quota-reset">{formatResetsIn(quota.resetsAt, now)}</span>}
    </span>
  )
}
