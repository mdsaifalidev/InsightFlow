# ADR-010: Provider-agnostic LLM adapter, facts-grounded

**Status:** Accepted · 2026-09-21

## Context
The original design used the OpenAI API. LLMs hallucinate numbers, which is unacceptable in an analytics product. Development and tests should not cost API money.

## Decision
- An `LLMProvider` protocol with `mock` and real provider implementations, selected by `LLM_PROVIDER`. *(Amended in Phase 5: the first real provider is Gemini, not Claude — see below.)*
- **Facts first:** Polars computes all statistics and anomalies. The LLM only narrates the structured facts, using structured output.
- **Validator:** numbers in the output must appear in the facts, or the output is regenerated (at most 2 tries) or the offending sentences are dropped.

## Consequences
- Trustworthy summaries. Free, deterministic dev and test runs through `mock`.
- A small abstraction layer to maintain. Provider-specific features (tool use, caching) sit behind the interface.

## Addendum (Phase 4, 2026-09-22)
- The brief is written **inside the ingest job** (`generating_insight` stage, before `ready`), matching the UI's SSE contract. If the provider fails, the template brief is used; if brief generation fails entirely, the dataset still becomes ready and `GET /insights/latest` writes one on demand.
- Only the `mock` provider exists so far: the facts engine's template, the same text as the MSW mock. `app/llm/base.py` (`LLMProvider`) and `app/llm/brief.py` (validate → up to 2 retries with the ungrounded numbers as feedback → drop ungrounded sentences) are in place, so Claude/OpenAI adapters are one file each.
- Anomalies use robust z-scores (median/MAD × 1.4826) with |z| ≥ 3.5, not the plain |z| > 3 first sketched in the PRD: one spike can't inflate its own baseline.

## Addendum (Phase 5, Checkpoint C, 2026-09-23)

**Gemini is the first real provider** (`app/llm/gemini.py`, `LLM_PROVIDER=gemini`), pinned to
`gemini-2.5-flash` and overridable with `GEMINI_MODEL`. Chosen over the Claude and OpenAI adapters
this ADR originally named: an AI Studio key is free to start, the SDK takes a Pydantic model
directly as `response_schema`, and `thinking_budget=0` keeps a narration task off the reasoning
meter. Both other adapters remain one file each — nothing in the seam is Gemini-shaped.

- **The prompt is its own module** (`app/llm/prompt.py`). It sends the facts (id, kind, label,
  value, format) and the template draft, and states the `{{factId}}` rule. Its list of allowed
  literals — dates, months, years, clock times — must stay in step with `ALLOWED_NUMBER_PATTERNS`
  in `app/engine/narrative.py`, or every brief burns three attempts and lands on the template.
- **Transient errors now cost one attempt, not the brief.** `TransientLLMError` (timeouts, 408/429/5xx)
  retries within the same three-attempt budget; anything else — a bad key, a rejected schema — fails
  once and falls back, because it would fail identically three times.
- **Two timeouts.** Each call is capped by `GEMINI_TIMEOUT_S` (20s) and all attempts together by
  `MAX_TOTAL_SECONDS` (45s), because `GET /insights/latest` and the column-type override write a
  brief **inside** an HTTP request. Measured: 2–4s per call.
- **Next questions are validated too.** They were passing through ungrounded; the template never put
  a number in one, but a real model does ("Why did revenue fall 22%?").
- **An empty brief is not a brief.** If every sentence is dropped as ungrounded, the template is
  used instead of writing an empty summary to the database.
- **Keys live in an untracked `services/data-py/.env.local`**, which overrides the committed
  `.env.development`. `tests/conftest.py` pins `LLM_PROVIDER=mock` at import, so a developer's local
  key can never make the test suite call — or bill — a real API.
- `app/llm/*` is deliberately **outside** the TS/Python byte-parity contract; only `app/engine/*` is.
