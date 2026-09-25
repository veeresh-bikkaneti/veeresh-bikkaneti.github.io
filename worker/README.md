# veer-search-proxy

A minimal Cloudflare Worker that holds the Brave Search API key server-side
so Veer (the portfolio chatbot) can ground rare, unmatched questions in a
live web search — without ever exposing a secret key in public client-side
code.

This is the **only** backend piece involved. It does not call an LLM, store
any data, or know anything about Veeresh's resume/repos/blog — it's a
single-purpose relay: `GET /?q=<query>` → Brave Search → trimmed JSON
results. The actual reasoning (deciding to search, writing the final answer)
happens client-side in the visitor's own browser via Chrome's built-in
on-device AI. See the `webSearch` section of `index.html` for that side.

## One-time setup

You'll need a [Cloudflare account](https://dash.cloudflare.com/sign-up)
(free tier is enough) and a
[Brave Search API key](https://brave.com/search/api/) (free tier: 2,000
queries/month, more than enough for a personal portfolio site).

```bash
cd worker
npm install -g wrangler   # if you don't already have it
wrangler login             # opens a browser to authenticate with Cloudflare

# Set your Brave Search API key as a secret — never put it in wrangler.toml
# or any committed file. This prompts for the value interactively.
wrangler secret put BRAVE_API_KEY

wrangler deploy
```

`wrangler deploy` prints the Worker's URL, something like:

```
https://veer-search-proxy.<your-subdomain>.workers.dev
```

## Wiring it into Veer

Copy that URL into `SEARCH_PROXY_URL` near the top of the Veer script block
in `../index.html`, then commit and push. Leaving `SEARCH_PROXY_URL` empty
(the default) keeps web-search grounding fully disabled — Veer works exactly
as it does today, with no behavior change for anyone.

## Cost and limits

- **Cloudflare Workers free tier**: 100,000 requests/day — nowhere close to
  being a constraint here.
- **Brave Search API free tier**: 2,000 queries/month. Veer only calls this
  Worker as a last resort (when nothing in its resume/GitHub/blog knowledge
  base matches, and only on Chrome with on-device AI available), so realistic
  usage should stay well under that. If it ever doesn't, Brave's dashboard
  shows usage and you can add a paid tier or tighten the client-side gating
  further.
- **No rate limiting is implemented in the Worker itself.** The Origin check
  keeps casual abuse off (a non-browser client can spoof it, but that's a
  higher bar than "anyone who views page source"). If abuse becomes a real
  problem, add a Cloudflare Rate Limiting rule in the dashboard (Workers free
  tier doesn't include the rate-limiting API binding) or put the route behind
  Cloudflare Access / Turnstile.

## Updating

Edit `src/index.js`, then `wrangler deploy` again. No changes needed on the
`index.html` side unless the Worker's URL changes.
