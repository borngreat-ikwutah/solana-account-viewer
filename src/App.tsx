import { useCallback, useEffect, useRef, useState } from 'react'
import { AddressInput } from './components/AddressInput'
import { BalanceTable } from './components/BalanceTable'
import { NetworkSwitcher } from './components/NetworkSwitcher'
import {
  fetchBalances,
  NETWORKS,
  parseAddresses,
  type AccountBalance,
  type NetworkId,
} from './lib/solana'

/**
 * Solana Account Viewer — paste addresses, read SOL balances on any cluster.
 *
 * State model: the textarea is the source of truth for *which* addresses were
 * asked about, while `rows` holds the *result* of the most recent lookup. They
 * are deliberately separate — editing the textarea must not wipe results the
 * user is still reading.
 */
function App() {
  const [network, setNetwork] = useState<NetworkId>('mainnet-beta')
  const [input, setInput] = useState('')
  const [rows, setRows] = useState<AccountBalance[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  /**
   * The in-flight request's controller. Kept in a ref, not state, because it is
   * not rendered anywhere — it exists solely so a new lookup can cancel the
   * previous one. Without that, switching clusters quickly would let a slow
   * mainnet response land after a fast devnet one and overwrite it.
   */
  const abortRef = useRef<AbortController | null>(null)

  // Cancel any pending request if the component unmounts mid-flight.
  useEffect(() => () => abortRef.current?.abort(), [])

  /**
   * Runs a lookup, superseding any lookup already in flight.
   *
   * `cluster` is passed explicitly rather than read from state so this stays a
   * pure function of its arguments and cannot race against a stale render.
   */
  const lookup = useCallback(
    async (addresses: string[], cluster: NetworkId) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsLoading(true)
      setGlobalError(null)
      // Show every row immediately so the table structure is stable while the
      // request is in flight instead of appearing all at once on success.
      setRows(
        addresses.map((address) => ({
          address,
          status: 'loading',
          lamports: 0,
          sol: 0,
        })),
      )

      try {
        const results = await fetchBalances(addresses, cluster, controller.signal)
        if (controller.signal.aborted) return
        setRows(results)
      } catch (error) {
        // An abort is a superseded request, not a failure to report.
        if (controller.signal.aborted) return
        setGlobalError(
          error instanceof Error ? error.message : 'Something went wrong',
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    },
    [],
  )

  const handleSubmit = useCallback(() => {
    const addresses = parseAddresses(input)
    if (addresses.length === 0) return
    void lookup(addresses, network)
  }, [input, lookup, network])

  /**
   * Switching cluster re-queries the current addresses instead of showing stale
   * mainnet balances under a "Devnet" label. The addresses come from `rows`,
   * not the textarea, so whitespace the user has since typed is not clobbered.
   */
  const handleNetworkChange = useCallback(
    (next: NetworkId) => {
      setNetwork(next)
      if (rows.length > 0 && !isLoading) {
        void lookup(
          rows.map((row) => row.address),
          next,
        )
      }
    },
    [isLoading, lookup, rows],
  )

  // Only successfully resolved rows count toward the total, so a mixed result
  // set still adds up to something true.
  const totalSol = rows.reduce(
    (sum, row) => (row.status === 'success' ? sum + row.sol : sum),
    0,
  )
  const activeCount = rows.filter((row) => row.status === 'success').length

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <header className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Solana Account Viewer
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Paste one or more addresses and check their SOL balance on any
                cluster.
              </p>
            </div>
            <NetworkSwitcher
              value={network}
              onChange={handleNetworkChange}
              disabled={isLoading}
            />
          </div>

          {/* Showing the live endpoint removes any doubt about which cluster
              answered, and points users to where to swap in their own RPC. */}
          <p className="text-xs text-slate-400">
            Cluster:{' '}
            <span className="font-mono">{NETWORKS[network].rpcUrl}</span>
          </p>
        </header>

        <main className="mt-8 space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <AddressInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />
          </section>

          {/* Transport-level failure (network down, HTTP error) — per-address
              problems are reported in their own row instead. */}
          {globalError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              {globalError}
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-700">
                {activeCount} of {rows.length} resolved on{' '}
                {NETWORKS[network].label}
              </h2>
              {activeCount > 0 ? (
                <p className="font-mono text-sm text-slate-500 tabular-nums">
                  Total:{' '}
                  {totalSol.toLocaleString('en-US', { maximumFractionDigits: 9 })}{' '}
                  SOL
                </p>
              ) : null}
            </div>
          ) : null}

          <BalanceTable rows={rows} />
        </main>

        <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
          Public RPC endpoints are rate limited. Use your own provider for heavy
          use.
        </footer>
      </div>
    </div>
  )
}

export default App