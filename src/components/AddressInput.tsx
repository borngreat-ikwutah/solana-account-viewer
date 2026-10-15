import { isValidAddress, parseAddresses } from '../lib/solana'

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
}

/**
 * Textarea for pasting one or more addresses.
 *
 * A textarea rather than repeated single-line inputs: people paste from wallets
 * and block explorers in bulk, and a textarea accepts every paste shape without
 * the user having to reformat it first.
 */
export function AddressInput({
  value,
  onChange,
  onSubmit,
  isLoading,
}: AddressInputProps) {
  const addresses = parseAddresses(value)
  const invalidCount = addresses.filter((a) => !isValidAddress(a)).length

  return (
    <form
      onSubmit={(event) => {
        // Keep the submit from navigating; the form is a keyboard affordance.
        event.preventDefault()
        onSubmit()
      }}
      className="space-y-3"
    >
      <div>
        <label
          htmlFor="addresses"
          className="block text-sm font-medium text-slate-700"
        >
          Solana addresses
        </label>
        <p className="mt-1 text-sm text-slate-500">
          One address per line — commas and spaces work too.
        </p>
      </div>

      <textarea
        id="addresses"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={7}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={'9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\nSo11111111111111111111111111111111111111112'}
        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isLoading || addresses.length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Checking…' : 'Check balances'}
        </button>

        {/* aria-live so the count is announced after a paste, not silently. */}
        <p className="text-sm text-slate-500" aria-live="polite">
          {addresses.length === 0
            ? 'No addresses yet'
            : `${addresses.length} address${addresses.length === 1 ? '' : 'es'}${
                invalidCount > 0
                  ? ` · ${invalidCount} invalid will be flagged`
                  : ''
              }`}
        </p>
      </div>
    </form>
  )
}