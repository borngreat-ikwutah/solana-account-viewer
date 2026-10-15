import { NETWORK_ORDER, NETWORKS, type NetworkId } from '../lib/solana'

interface NetworkSwitcherProps {
  value: NetworkId
  onChange: (network: NetworkId) => void
  disabled?: boolean
}

/**
 * Segmented control for choosing a cluster.
 *
 * Uses `radiogroup`/`radio` rather than a group of toggles because exactly one
 * cluster is active at a time — that is what a radiogroup tells assistive
 * technology, and it gives arrow-key navigation for free.
 */
export function NetworkSwitcher({
  value,
  onChange,
  disabled = false,
}: NetworkSwitcherProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Solana cluster"
      className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
    >
      {NETWORK_ORDER.map((id) => {
        const network = NETWORKS[id]
        const isActive = id === value

        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
              isActive
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {/* Colour alone must not carry the meaning — the label does. */}
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${network.dotClass} ${
                isActive ? '' : 'opacity-40'
              }`}
            />
            {network.shortLabel}
          </button>
        )
      })}
    </div>
  )
}