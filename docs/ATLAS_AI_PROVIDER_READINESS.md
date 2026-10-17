# AI Provider Readiness

Run `node scripts/atlas-provider-readiness.mjs` on the existing Mac to inventory configured provider families without external API calls or installing anything. It reports only booleans; **PRESENT_UNTESTED** does not establish authentication, available free quota, or a working model. `--json` returns structured status; `--no-local` skips localhost Qwen port check.

Provider routes in the existing private Newton-Empire code: Cerebras, Groq, Gemini, Mistral, NVIDIA, OpenRouter, Cloudflare AI. DeepSeek, xAI API, Perplexity API and Voyage are noted separately; Grok Bot is NOT the same as a configured xAI API key, and Perplexity Pro does not imply API access.

No public keys, new provider signups or paid requests. After inventory, configure only routes with confirmed account permission and verified zero-cost allowance; require separate human authorisation for any billable calls. Continue completing existing builds, not initiating sales.
