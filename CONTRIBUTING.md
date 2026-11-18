# Contributing to SynapsVault Frontend

A Stellar-powered marketplace UI built with React, TypeScript, Vite, and Tailwind CSS.

## Local Development

### Prerequisites
- Node.js 20+
- npm (or pnpm)

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env — set VITE_API_URL to your backend (default: http://localhost:3000)

# Start dev server
npm run dev
# Open http://localhost:5173
```

Dev server includes hot module reload and TypeScript checking.

## Docker Development

```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
# Open http://localhost:8080
```

## Branch Strategy

| Branch | Purpose | Deploy Target |
|--------|---------|----------------|
| `main` | Production-ready | Vercel → production |
| `dev` | Staging/integration | Vercel preview |
| `feat/*` | Feature branches | PR to `dev` |
| `fix/*` | Bug fixes | PR to `dev` |
| `chore/*` | Maintenance | PR to `dev` |

## Development Workflow

1. **Create feature branch from dev:**
   ```bash
   git checkout -b feat/my-feature dev
   ```

2. **Make changes and test locally:**
   ```bash
   npm run dev
   npm run test:watch
   ```

3. **Before committing, verify:**
   ```bash
   npm run lint        # ESLint passes (CI enforces it)
   npm run typecheck   # Type safety
   npm run test        # All tests pass
   npm run build       # Production build works
   # or simply: npm run check
   ```

4. **Commit with conventional format (see below)**

5. **Push and create PR to `dev`**

6. **After review + merge to `dev`:**
   - Staging deploy to Vercel preview
   - Create release PR to `main`

## Testing

```bash
npm run test           # Run all tests once
npm run test:watch    # Watch mode for development
npm run test:ui       # Visual UI for test runner
```

Tests use Vitest + React Testing Library. Focus on user behavior, not implementation details.

## Code Standards

- **TypeScript**: Strict mode, no `any` without comment
- **Components**: Functional components with hooks
- **Styling**: Use semantic Tailwind tokens (`bg-surface`, `text-fg-muted`, `border-line`) — see [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)
- **Accessibility**: ARIA labels, keyboard navigation
- **Performance**: Code-split routes, memoize expensive renders
- **Errors**: Use Sentry for tracking, user-friendly error messages

## Design System

Tokens live in `src/styles/tokens.css` and are exposed to Tailwind as semantic
classes that adapt to light/dark automatically. Read
[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) before adding UI.

## Adding a New Page

1. **Create component:** `src/pages/MyPage.tsx`
2. **Add route:** Update `src/App.tsx`
3. **Add tests:** `src/pages/MyPage.test.tsx`
4. **Update nav:** Add link in main navigation
5. **Test:** `npm run dev` and verify routing works

## Commit Format (Conventional Commits)

```
feat(ui): add subscription plan selector
fix(wallet): handle Freighter disconnect race condition
test(catalog): add search filter tests
docs: update component library
refactor(theme): extract color variables to custom properties
chore: upgrade vite to 6.0
perf(catalog): memoize ResourceCard component
```

**Types:** feat, fix, test, docs, refactor, chore, perf, style

## Code Review Checklist

- [ ] Lint passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Tests pass (`npm run test`)
- [ ] Bundle size acceptable (check Vite output)
- [ ] No hardcoded colors/spacing (use CSS vars)
- [ ] Accessible (keyboard nav, ARIA labels)
- [ ] Mobile responsive (tested at 320px+)
- [ ] Follows conventional commit format
- [ ] PR description explains "why", not "what"

## Wallet Integration

Uses Stellar Freighter for wallet connection. See `src/api/agent.ts` for integration patterns.

For testing wallet-dependent components without triggering a real signature request, see
[Testing wallet interactions](#testing-wallet-interactions) below.

## Testing wallet interactions

Components that call Freighter should never reach the extension during unit tests.
Mock the hook that wraps the wallet call instead of the extension itself.

`BuyModal` delegates all payment logic to `useBuyResource`. The test suite in
`src/components/BuyModal.test.tsx` mocks that hook at the module boundary:

```ts
// At the top of the test file
vi.mock("../hooks/useBuyResource.js", () => ({
  useBuyResource: vi.fn(),
}));
```

Then each test drives the component into the desired state by configuring the mock's
return value with `vi.mocked`:

```ts
// Wallet connected — idle state, pay button enabled
vi.mocked(useBuyResource).mockReturnValue({
  status: "idle",
  result: null,
  error: null,
  buy: mockBuy,
  reset: mockReset,
});
render(<BuyModal
  resourceTitle="Premium Dataset"
  price="1.50"
  recipient="GBUYER1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  accessUrl="https://api.example.com/resources/abc"
  walletAddress="GWALLET1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  onClose={vi.fn()}
  onCopyUrl={vi.fn()}
/>);
// pay button is now enabled
expect(screen.getByRole("button", { name: /pay 1\.50 usdc/i })).toBeEnabled();
```

**Key patterns**

| Scenario | `status` to set | What to assert |
|---|---|---|
| No wallet connected | `"idle"` + `walletAddress={null}` | Pay button disabled, "connect your Freighter wallet" notice visible |
| Payment in flight | `"paying"` | Spinner has `aria-busy="true"`, Close button disabled |
| Payment succeeded | `"success"` + `result.explorerUrl` | Explorer link rendered with correct `href` |
| Payment failed | `"error"` + `error` message | Error text visible, "Try again" button calls `buy` |

Because the mock controls all state transitions, tests run offline and never prompt
the Freighter browser extension for a signature.

## Payment Integration

Uses x402 protocol via `@x402/fetch` and `@x402/stellar`. See `src/api/payments.ts`.

## Troubleshooting

**Port 5173 already in use?**
```bash
npm run dev -- --port 5174
```

**Build too large?**
```bash
npm run bundle:stats
# Opens stats.html showing bundle breakdown
```

**Tests failing?**
```bash
npm run test:watch
# Rerun on file changes
```

## Questions?

- Open a GitHub issue
- Check existing PRs for similar work
- Ask in Stellar Dev Discord #synapsvault
