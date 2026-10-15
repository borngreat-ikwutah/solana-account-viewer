import { useState } from 'react'
import {
  formatLamports,
  formatSol,
  truncateAddress,
  type AccountBalance,
} from '../lib/solana'

/**
 * Copies an address to the clipboard and confirms with a tick.
 *
 * The confirmation is a transient flag rather than a toast: it is local to one
 * row, so there is nothing to manage centrally. The reset timer is only cleared
 * by firing it again — acceptable because a second click is harmless.
 */
function CopyButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      aria-label={`Copy ${address}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard access can be denied by permissions policy. Failing
          // silently beats an error toast for such a small affordance.
          setCopied(false)
        }
      }}
      className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none"
    >
      {copied ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-4 text-emerald-600"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13.5 4.5 6 12l-3-3" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5.5" y="5.5" width="8" height="8" rx="2" />
          <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" />
        </svg>
      )}
    </button>
  )
}

/**
 * Row status as a coloured pill.
 *
 * The word carries the meaning and the colour only reinforces it — status must
 * stay legible for colour-blind users and in a screenshot printed in greyscale.
 */
function StatusPill({ row }: { row: AccountBalance }) {
  if (row.status === 'loading') {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-slate-500">
        <span className="size-1.5 animate-pulse rounded-full bg-slate-400" />
        Loading
      </span>
    )
  }

  if (row.status === 'invalid') {
    return (
      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
        Invalid
      </span>
    )
  }

  if (row.status === 'error') {
    return (
      // Node error text is too long for a pill, so it goes in the title and the
      // full message is rendered under the address in the row body.
      <span
        className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
        title={row.error}
      >
        Error
      </span>
    )
  }

  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      OK
    </span>
  )
}

interface BalanceTableProps {
  rows: AccountBalance[]
}

/**
 * Results table. One row per requested address, rendered in request order.
 *
 * Rows never disappear while loading — an in-flight row keeps its address and
 * shows a placeholder balance, so the list does not jump around as results
 * stream in.
 */
export function BalanceTable({ rows }: BalanceTableProps) {
  if (rows.length === 0) return null

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <caption className="sr-only">SOL balances by address</caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">
                Address
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Balance
              </th>
              <th scope="col" className="px-5 py-3 text-right font-medium">
                Lamports
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.address} className="align-top">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    {/* Truncated for display, full value on hover and on copy. */}
                    <span className="font-mono text-slate-900" title={row.address}>
                      {truncateAddress(row.address, 6, 6)}
                    </span>
                    <CopyButton address={row.address} />
                  </div>
                  {row.error ? (
                    <p className="mt-1 text-xs text-amber-700">{row.error}</p>
                  ) : null}
                </td>
                <td className="px-5 py-3 font-mono text-slate-900 tabular-nums">
                  {/* A dash, not 0: we do not have a balance to report. */}
                  {row.status === 'success' || row.status === 'loading'
                    ? formatSol(row.sol)
                    : '—'}
                  {row.status === 'success' ? (
                    <span className="ml-1 text-xs text-slate-400">SOL</span>
                  ) : null}
                </td>
                <td className="px-5 py-3 text-right font-mono text-slate-500 tabular-nums">
                  {row.status === 'success' ? formatLamports(row.lamports) : '—'}
                </td>
                <td className="px-5 py-3">
                  <StatusPill row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}