"""Writes a grounded brief (ADR-010): provider → validator → up to two retries
with feedback → drop ungrounded sentences. Any provider error falls back to
the deterministic template, so a brief never blocks a dataset.
"""

import time
from dataclasses import dataclass
from typing import Any

from app.config import Settings
from app.engine.facts import FactSet
from app.engine.narrative import keep_grounded, ungrounded_numbers
from app.llm.base import BriefText, LLMProvider, TransientLLMError
from app.llm.mock import MockProvider
from app.log import log

MAX_ATTEMPTS = 3  # the first try plus two retries
MAX_FINDINGS = 5
MAX_QUESTIONS = 3
# The lazy insight path writes a brief inside an HTTP request, so all attempts
# together get one budget (nginx gives up at 120s).
MAX_TOTAL_SECONDS = 45.0


@dataclass
class Brief:
    summary: str
    findings: list[str]
    next_questions: list[str]
    provider: str
    model: str
    input_tokens: int | None
    output_tokens: int | None


def get_provider(settings: Settings) -> LLMProvider:
    # One line per provider (ADR-010); Claude and OpenAI would plug in here too.
    if settings.llm_provider == "gemini":
        # Imported here so the SDK is only loaded when it is configured.
        from app.llm.gemini import GeminiProvider

        return GeminiProvider(settings)
    return MockProvider()


def _problems(text: BriefText, facts: list[dict[str, Any]]) -> list[str]:
    return [
        number
        for sentence in [*text.summary, *text.findings, *text.next_questions]
        for number in ungrounded_numbers(sentence, facts)
    ]


def _finish(text: BriefText, facts: list[dict[str, Any]], provider: LLMProvider) -> Brief:
    return Brief(
        summary=" ".join(keep_grounded(text.summary, facts)),
        findings=keep_grounded(text.findings, facts)[:MAX_FINDINGS],
        # Questions are validated too: a real model writes "Why did it fall 22%?"
        next_questions=list(dict.fromkeys(keep_grounded(text.next_questions, facts)))[
            :MAX_QUESTIONS
        ],
        provider=provider.provider,
        model=provider.model,
        input_tokens=text.input_tokens,
        output_tokens=text.output_tokens,
    )


async def generate_brief(fact_set: FactSet, provider: LLMProvider) -> Brief:
    facts = fact_set.facts
    feedback: list[str] = []
    text: BriefText | None = None
    deadline = time.monotonic() + MAX_TOTAL_SECONDS
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            text = await provider.write(facts, fact_set.draft, feedback)
        except TransientLLMError as error:
            # A timeout or a 5xx costs one attempt, not the whole brief.
            log.warning(
                "brief_attempt_failed",
                provider=provider.provider,
                attempt=attempt,
                error=str(error),
            )
            if time.monotonic() >= deadline:
                break
            continue
        except Exception:
            # A bad key or a rejected schema will fail the same way three times.
            log.exception("brief_provider_failed", provider=provider.provider, attempt=attempt)
            break
        feedback = _problems(text, facts)
        if not feedback:
            break
        log.warning(
            "brief_ungrounded", provider=provider.provider, attempt=attempt, numbers=feedback
        )
        if time.monotonic() >= deadline:
            break

    # Nothing usable came back, or every sentence was dropped as ungrounded:
    # the template keeps the dataset readable.
    brief = _finish(text, facts, provider) if text is not None else None
    if brief is None or not brief.summary:
        template = MockProvider()
        return _finish(await template.write(facts, fact_set.draft, []), facts, template)
    return brief
