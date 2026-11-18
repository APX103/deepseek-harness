/**
 * The Token Plan panel's table data: types mirroring the loopback plan
 * routes plus the date-range helper the ledger uses.
 */

/** One 收支 ledger row as the loopback endpoint serves it. */
export interface InkstoneLedgerRow {
  readonly occurredAt: string
  readonly typeName: string
  readonly channelName: string
  readonly creditDelta: number
  readonly remark: string
  readonly model: string
}

/** One page of ledger rows. */
export interface InkstoneLedgerPage {
  readonly total: number
  readonly items: readonly InkstoneLedgerRow[]
}

/** One 墨点包 row as the loopback endpoint serves it. */
export interface InkstonePackageRow {
  readonly pkgId: string
  readonly cycleType: string
  readonly cycleStart: string
  readonly cycleEnd: string
  readonly totalCredits: number
  readonly remainingCredits: number
  readonly status: string
  readonly kindName: string
  readonly remark: string
  readonly expireAt: string
}

/** One 提额申请 row as the loopback endpoint serves it. */
export interface InkstoneApplicationRow {
  readonly id: string
  readonly scenarioName: string
  readonly status: string
  readonly appliedAt: string
}

/** Format one date as `YYYY-MM-DD` for the ledger range. */
export function formatPlanDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** The default ledger window: the last 30 days, ending today. */
export function defaultLedgerRange(now = new Date()): { start: string; end: string } {
  const end = formatPlanDate(now)
  const past = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
  return { start: formatPlanDate(past), end }
}

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    if (!response.ok) return undefined
    return await response.json() as T
  } catch {
    return undefined
  }
}

/** Fetch one ledger page from the loopback endpoint. */
export function fetchLedger(baseUrl: string, start: string, end: string, page: number): Promise<InkstoneLedgerPage | undefined> {
  return getJson<InkstoneLedgerPage>(`${baseUrl}/session/plan/transactions?start=${start}&end=${end}&page=${page}`)
}

/** Fetch the 墨点包 grants from the loopback endpoint. */
export function fetchPackages(baseUrl: string): Promise<{ packages: readonly InkstonePackageRow[] } | undefined> {
  return getJson<{ packages: readonly InkstonePackageRow[] }>(`${baseUrl}/session/plan/packages`)
}

/** Fetch the 提额申请 records from the loopback endpoint. */
export function fetchApplications(baseUrl: string): Promise<{ applications: readonly InkstoneApplicationRow[] } | undefined> {
  return getJson<{ applications: readonly InkstoneApplicationRow[] }>(`${baseUrl}/session/plan/applications`)
}
