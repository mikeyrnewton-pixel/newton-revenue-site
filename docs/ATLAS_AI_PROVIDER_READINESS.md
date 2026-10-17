# AI Provider Readiness

Run `node scripts/atlas-provider-readiness.mjs` on the existing Mac to inventory configured provider families without external API calls or installing anything. It reports only booleans; **PRESENT_UNTESTED** does not establish authentication, available free quota, or a working model. `--json` returns structured status; `--no-local` skips localhost Qwen port check.

Provider routes in the existing private Newton-Empire code: Cerebras, Groq, Gemini, Mistral, NVIDIA, OpenRouter, Cloudflare AI. DeepSeek, xAI API, Perplexity API and Voyage are noted separately; Grok Bot is NOT the same as a configured xAI API key, and Perplexity Pro does not imply API access.

No public keys, new provider signups or paid requests. After inventory, configure only routes with confirmed account permission and verified zero-cost allowance; require separate human authorisation for any billable calls. Continue completing existing builds, not initiating sales.

## Build-stage integration (17 October 2026)

The existing public `scripts/bootstrap_mac_builds.sh --apply` now runs the scanner **locally on the owner's Mac** immediately after offline tests, saving `~/ATLAS-BUILD-READY/results/AI_PROVIDER_READINESS.json` with private file permissions. Its terminal receipt shows a count of configured-but-untested credentials and three optional disabled API routes; it never prints key material, makes provider API requests or changes the Mac's running bots.

The private Newton-Empire repository has also gained optional, opt-in routes for DeepSeek, xAI API and Perplexity API (PR12); that source being merged is **not** evidence the private Mac checkout is installed, credentialed or billed. The scanner therefore marks those as `OPTIONAL_DISABLED_IN_SOURCE` and explicitly reports Mac router deployment unverified. An xAI key is not enough: the optional router also requires an explicit model ID and user-approved billing flags. Do not set billing flags merely to pass a test.

A real provider is **connected** only after the existing private runtime is installed, proper account access and zero-cost allowance are confirmed, and an individually authorised, bounded test succeeds. Perplexity Pro and Grok Bot are separate products from their provider APIs.
