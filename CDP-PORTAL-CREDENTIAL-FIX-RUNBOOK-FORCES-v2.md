# CDP Portal — Forces' Part Only (v2)

**For:** Forces. This is everything in the credential fix that genuinely requires your own login — nothing else. Kov has the rest as a separate directive.

## 1. Fix the key in the Portal

`portal.cdp.coinbase.com` → correct project → **API keys** → confirm the existing key is under the **Secret API Keys** tab, not **Client API Keys**. If it's a Client key, that's the whole bug — generate a new one from Secret API Keys (nickname, IP allowlist to `44.243.254.19`, default Ed25519). If it's already Secret, click into it and check the IP allowlist actually reads `44.243.254.19` — fix if wrong, regenerate only if the Portal won't let you edit an existing key's restrictions.

## 2. If you generated or edited anything, paste the values into local `.env`

`C:\Users\kidco\dev\grey\.env` — same two lines as before (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`). This is the one step that can't be delegated — the Portal only shows the secret once, to you, in your own browser session. Once it's in local `.env`, Kov takes over from there.

That's it — two steps. Everything else is in the Kov directive below.
