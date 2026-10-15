# Solana Account Viewer

Paste one or more Solana addresses, get back their SOL balances — on **Mainnet**, **Devnet**, or **Testnet**.

Built with React 19, TypeScript, Vite and Tailwind CSS v4. No Solana SDK: the app talks to the cluster's JSON-RPC endpoint directly, so the whole bundle is ~72 kB gzipped.

---

## Quick start

You need [Node.js](https://nodejs.org) **20.19+ or 22.12+** (required by Vite 8).

```bash
bun install      # or: npm install
bun run dev      # or: npm run dev
```

Then open the URL Vite prints (usually <http://localhost:5173>).

Other commands:

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the dev server with hot reload |
| `bun run build` | Type-check, then build to `dist/` |
| `bun run preview` | Serve the production build locally |
| `bun run lint` | Run [Oxlint](https://oxc.rs) over the source |

`bun` and `npm` are interchangeable throughout — pick whichever you have.

---

## How to use

1. **Paste addresses** into the textarea. One per line works, and so does a comma- or space-separated blob pasted from anywhere.
2. **Check balances** with the button. (<kbd>Enter</kbd> inside the textarea adds a new line, which is exactly what you want when pasting many addresses — use <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> if you prefer to submit from the keyboard.)
3. **Switch cluster** with the Mainnet / Devnet / Testnet switcher. If you already ran a lookup, it **re-runs automatically** against the cluster you picked, so the numbers on screen always match the cluster named above the table.

You get one row per address, showing the balance in SOL and in lamports, plus a status:

| Status | Meaning |
| --- | --- |
| **OK** | Resolved. The account exists and its balance is shown. |
| **Invalid** | Not a valid Solana address — caught locally, never sent to the network. |
| **Error** | The node rejected this address, or the RPC failed for it. The reason is printed under the address. |
| **Loading** | Still in flight. |

An address that simply doesn't exist on the cluster reports **OK with a balance of 0** — that is a real answer, not a failure.

---

## How it works

### One request for all addresses

All valid addresses are sent as a **single batched JSON-RPC request**, so 20 addresses cost one round trip rather than 20. That matters a lot against a free public endpoint, which rate-limits by request count.

If an endpoint rejects batch payloads, the app automatically falls back to issuing the requests individually — still concurrent, and one address failing never blocks the others.

### Address validation happens locally

Addresses are checked against a base58 pattern *before* any network call, so a typo is reported instantly instead of after a round trip. This is a shape check, not a cryptographic one — it will not catch a well-formed address that isn't on curve. A node rejects those, and they show up as an **Error** row.

### Requests cancel themselves

Every lookup runs under an `AbortController`. Start a new lookup and the previous one is cancelled, so switching clusters quickly can never leave a slow stale response overwriting a fresh one. There's also a 20-second timeout on the underlying request.

---

## Using your own RPC endpoint

The app ships with Solana's free public endpoints, which are **rate limited** and can be slow or unavailable. For real use, swap in a provider (Helius, QuickNode, Alchemy — all have free tiers).

Open `src/lib/solana.ts` and edit the `NETWORKS` map:

```ts
export const NETWORKS: Record<NetworkId, Network> = {
  'mainnet-beta': {
    id: 'mainnet-beta',
    label: 'Mainnet Beta',
    shortLabel: 'Mainnet',
    rpcUrl: 'https://your-provider.example/mainnet',   // ← your endpoint
    dotClass: 'bg-emerald-500',
  },
  // ...devnet, testnet
}
```

The active endpoint is displayed under the header, so you can confirm your change took effect.

---

## Project structure

```
src/
├── lib/
│   └── solana.ts              Cluster config, validation, RPC client
├── components/
│   ├── NetworkSwitcher.tsx    Mainnet / Devnet / Testnet control
│   ├── AddressInput.tsx       Address textarea and submit button
│   └── BalanceTable.tsx       Results table
├── App.tsx                    State, orchestration, layout
├── index.css                  Tailwind import and font tokens
└── main.tsx                   React entry point
```

All the chain logic lives in `src/lib/solana.ts` and has no React dependency — the components only render what it returns, which keeps it straightforward to test in isolation.

---

## Troubleshooting

**"Rate limited by the public RPC endpoint."**
The free endpoint is throttling you. Wait a moment, or [switch to your own provider](#using-your-own-rpc-endpoint).

**Everything fails at once with a connection error.**
Your network or firewall is likely blocking `api.*.solana.com`, or you're offline. Public RPC endpoints only work over HTTPS.

**An address shows as Invalid but looks fine.**
Check for copied punctuation, a wrapped line, or a missing character. Base58 excludes `0`, `O`, `I` and `l` — if your address appears to contain one, it's usually a transcription slip.

**The page is blank / styles are missing.**
Stop the dev server and reinstall; the Tailwind Vite plugin needs to be present for the stylesheet to build.

---

## Limitations

- **Balances are a point-in-time snapshot.** The page doesn't subscribe to changes over a websocket — re-run a lookup to refresh.
- **Address validation is shape-only**, as described above.
- **The public endpoints are shared infrastructure.** Don't build anything load-bearing on them.