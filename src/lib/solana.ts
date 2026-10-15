/**
 * Solana JSON-RPC client for balance lookups.
 *
 * Deliberately dependency-free: the only thing this app needs from the chain is
 * `getBalance`, which is a single JSON-RPC call. Pulling in `@solana/web3.js`
 * (~150 kB) for it would cost more than the feature is worth, so we talk to the
 * HTTP RPC directly and validate addresses with a base58 shape check instead.
 *
 * If this ever grows to need signatures, transactions or websockets, reach for
 * the official SDK rather than extending this file.
 */

export type NetworkId = 'mainnet-beta' | 'devnet' | 'testnet'

export interface Network {
  id: NetworkId
  label: string
  shortLabel: string
  rpcUrl: string
  /** Tailwind colour for the cluster indicator dot. */
  dotClass: string
}

/** Render order in the switcher. Deliberately mainnet-first, not alphabetical. */
export const NETWORK_ORDER: NetworkId[] = ['mainnet-beta', 'devnet', 'testnet']

/**
 * Solana's three public clusters. These endpoints are free but aggressively
 * rate limited — swap `rpcUrl` for a provider (Helius, QuickNode, ...) when
 * real traffic arrives.
 */
export const NETWORKS: Record<NetworkId, Network> = {
  'mainnet-beta': {
    id: 'mainnet-beta',
    label: 'Mainnet Beta',
    shortLabel: 'Mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    dotClass: 'bg-emerald-500',
  },
  devnet: {
    id: 'devnet',
    label: 'Devnet',
    shortLabel: 'Devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    dotClass: 'bg-violet-500',
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    shortLabel: 'Testnet',
    rpcUrl: 'https://api.testnet.solana.com',
    dotClass: 'bg-amber-500',
  },
}

export type BalanceStatus = 'loading' | 'success' | 'invalid' | 'error'

export interface AccountBalance {
  address: string
  status: BalanceStatus
  lamports: number
  sol: number
  error?: string
}

export const LAMPORTS_PER_SOL = 1_000_000_000

/**
 * Base58 excludes `0`, `O`, `I` and `l` to avoid transcription ambiguity, and a
 * pubkey is 32 bytes — 43 or 44 base58 chars once encoded.
 *
 * This is a shape check, not a cryptographic one: it catches typos and pasted
 * garbage client-side so the user gets an instant answer instead of an RPC
 * round trip. It will not catch a valid-shaped string that is not on curve. A
 * node rejects those anyway, and that surfaces as a per-row error.
 */
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** Public RPC endpoints are slow when busy; fail fast enough to stay useful. */
const RPC_TIMEOUT_MS = 20_000

/** True if `address` has the shape of a Solana pubkey. See {@link BASE58_ADDRESS}. */
export function isValidAddress(address: string): boolean {
  return BASE58_ADDRESS.test(address.trim())
}

/** 1 SOL = 1e9 lamports. Division keeps full lamport precision as a float. */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL
}

/**
 * 9 decimal places is exactly lamport precision, so formatting never hides a
 * balance the chain actually holds.
 */
export function formatSol(sol: number): string {
  return sol.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 9,
  })
}

export function formatLamports(lamports: number): string {
  return Math.trunc(lamports).toLocaleString('en-US')
}

/**
 * Keeps the head and tail of an address, which is what people actually verify
 * by eye — eliding the middle instead would defeat the purpose.
 */
export function truncateAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address
  return `${address.slice(0, lead)}…${address.slice(-tail)}`
}

/**
 * Splits free-form pasted input into unique addresses in first-seen order.
 *
 * Accepts newlines, commas, semicolons and runs of whitespace because people
 * paste from wherever they have the address — a wallet, a block explorer, a
 * spreadsheet. Duplicates collapse so we never pay for the same RPC twice.
 */
export function parseAddresses(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const token of raw.split(/[\s,;]+/)) {
    const address = token.trim()
    if (address.length === 0 || seen.has(address)) continue
    seen.add(address)
    result.push(address)
  }
  return result
}

interface RpcBalanceResult {
  value: number
}

interface RpcResponse {
  id: number
  result?: RpcBalanceResult
  error?: { code: number; message: string }
}

/**
 * Turns node-level errors into something actionable. A raw "429 Too Many
 * Requests" tells the user nothing; "rate limited, try again shortly" does.
 * Anything unrecognised passes through untouched rather than being mislabelled.
 */
function describeRpcError(message: string): string {
  if (/429|too many requests|rate/i.test(message)) {
    return 'Rate limited by the public RPC endpoint. Try again shortly.'
  }
  if (/block not available|slot .* skipped/i.test(message)) {
    return 'Account not found on this cluster.'
  }
  return message
}

async function postRpc(
  endpoint: string,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  // Non-2xx carries no JSON-RPC error object, so it has to become a thrown
  // error here or the caller would try to read a payload that isn't there.
  if (!response.ok) {
    throw new Error(`RPC responded with HTTP ${response.status}`)
  }

  return response.json()
}

/** Single-address path, used only by the fallback below. */
async function fetchBalance(
  endpoint: string,
  address: string,
  signal: AbortSignal,
): Promise<number> {
  const payload = await postRpc(
    endpoint,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address, { commitment: 'confirmed' }],
    },
    signal,
  )

  const parsed = payload as RpcResponse | null
  if (!parsed) throw new Error('Empty response from RPC')
  if (parsed.error) throw new Error(describeRpcError(parsed.error.message))
  if (!parsed.result) throw new Error('Malformed response from RPC')

  return parsed.result.value
}

/**
 * Resolves balances for many addresses against one cluster.
 *
 * Every valid address is sent as a single batched JSON-RPC request, so N
 * addresses cost one round trip instead of N — which matters a lot against a
 * rate-limited public endpoint. Invalid addresses are rejected locally and
 * never hit the network.
 *
 * @param addresses - Unique addresses in the order they should be displayed.
 * @param network - Cluster to query; balances are not comparable across them.
 * @param signal - Caller's abort signal, e.g. to cancel a superseded lookup.
 * @returns One row per input address, in input order. Every row is `success`,
 *   `invalid` or `error` — this never rejects for a per-address problem, only
 *   for an aborted call.
 * @throws AbortError if `signal` fires, so the caller can ignore stale results.
 */
export async function fetchBalances(
  addresses: string[],
  network: NetworkId,
  signal?: AbortSignal,
): Promise<AccountBalance[]> {
  // Our own controller composes the hard timeout with the caller's signal;
  // we cannot pass two signals to one fetch.
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)

  // A Map keyed by address keeps rows addressable while requests come back in
  // arbitrary order, and re-sending the same address can't duplicate a row.
  const results = new Map<string, AccountBalance>()

  try {
    const pending: string[] = []

    // Partition first: validate locally so obvious typos cost no network call.
    for (const address of addresses) {
      if (isValidAddress(address)) {
        pending.push(address)
        results.set(address, { address, status: 'loading', lamports: 0, sol: 0 })
      } else {
        results.set(address, {
          address,
          status: 'invalid',
          lamports: 0,
          sol: 0,
          error: 'Not a valid base58 Solana address',
        })
      }
    }

    if (pending.length > 0) {
      const endpoint = NETWORKS[network].rpcUrl
      const requests = pending.map((address, index) => ({
        jsonrpc: '2.0',
        id: index,
        method: 'getBalance',
        params: [address, { commitment: 'confirmed' }],
      }))

      let responses: RpcResponse[] | null = null

      try {
        const payload = await postRpc(endpoint, requests, controller.signal)
        if (Array.isArray(payload)) {
          responses = payload as RpcResponse[]
        }
      } catch {
        // Batch unsupported or transport failure — fall through to sequential.
        responses = null
      }

      // Length is checked too: a short array means we cannot align rows to
      // addresses, which would silently misattribute balances.
      if (responses && responses.length === pending.length) {
        // JSON-RPC does not guarantee response order, so match on the request
        // id rather than trusting positional alignment.
        const byId = new Map(responses.map((entry) => [entry.id, entry]))
        pending.forEach((address, index) => {
          const entry = byId.get(index)
          if (!entry) {
            results.set(address, {
              address,
              status: 'error',
              lamports: 0,
              sol: 0,
              error: 'No response for this address',
            })
            return
          }
          if (entry.error) {
            results.set(address, {
              address,
              status: 'error',
              lamports: 0,
              sol: 0,
              error: describeRpcError(entry.error.message),
            })
            return
          }
          // A missing value means an account that does not exist on this
          // cluster: zero, not an error.
          const lamports = entry.result?.value ?? 0
          results.set(address, {
            address,
            status: 'success',
            lamports,
            sol: lamportsToSol(lamports),
          })
        })
      } else {
        // Fallback for endpoints that reject batch payloads. Still concurrent,
        // and one address failing never blocks the others.
        await Promise.all(
          pending.map(async (address) => {
            try {
              const lamports = await fetchBalance(
                endpoint,
                address,
                controller.signal,
              )
              results.set(address, {
                address,
                status: 'success',
                lamports,
                sol: lamportsToSol(lamports),
              })
            } catch (error) {
              if (controller.signal.aborted) return
              results.set(address, {
                address,
                status: 'error',
                lamports: 0,
                sol: 0,
                error:
                  error instanceof Error ? error.message : 'Request failed',
              })
            }
          }),
        )
      }
    }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }

  // Surface cancellation as a rejection rather than returning partial rows,
  // so a superseded lookup can never overwrite fresher state in the UI.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // Rebuild from the input array to guarantee the caller's display order.
  return addresses.map(
    (address) =>
      results.get(address) ?? {
        address,
        status: 'error',
        lamports: 0,
        sol: 0,
        error: 'No result for this address',
      },
  )
}