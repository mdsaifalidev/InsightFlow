"""Gemini adapter (ADR-010), with a stubbed SDK: these tests never use the network."""

import asyncio
import json
from typing import Any

import pytest
from google.genai import errors

from app.config import Settings
from app.engine.facts import Draft, FactSet
from app.llm.brief import generate_brief, get_provider
from app.llm.gemini import GeminiProvider
from app.llm.prompt import build_prompt

FACTS = [
    {
        "id": "f1",
        "kind": "total",
        "label": "Total revenue",
        "value": 1769540.66,
        "format": "currency",
    },
    {
        "id": "f2",
        "kind": "change",
        "label": "Total revenue change in April 2025",
        "value": -0.2206,
        "format": "change",
        "ref": {"widgetId": "auto:0", "x": "2025-04-01"},
    },
]
DRAFT = Draft(
    lead=["Total revenue fell {{f2}} in April 2025."],
    summary=["Across the whole dataset, total revenue is {{f1}}."],
    findings=["A grounded finding."],
    questions=["What changed in April?"],
)
FACT_SET = FactSet(facts=FACTS, anomalies=[], draft=DRAFT)


GROUNDED = {"summary": ["Revenue is {{f1}}."], "findings": [], "next_questions": []}


class FakeResponse:
    def __init__(
        self,
        payload: dict[str, Any],
        tokens: tuple[int, int] = (120, 45),
        text: str | None = None,
    ) -> None:
        self.text = json.dumps(payload) if text is None else text
        self.candidates: list[Any] = []
        self.usage_metadata = type(
            "Usage", (), {"prompt_token_count": tokens[0], "candidates_token_count": tokens[1]}
        )()


class FakeModels:
    def __init__(self, replies: list[Any]) -> None:
        self.replies = replies
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        if reply == "hang":
            await asyncio.sleep(10)
        return reply


class FakeClient:
    def __init__(self, replies: list[Any]) -> None:
        self.models = FakeModels(replies)
        self.aio = self


def provider_for(replies: list[Any], **overrides: Any) -> tuple[GeminiProvider, FakeClient]:
    settings = Settings(
        database_url="postgresql+asyncpg://x/y",
        llm_provider="gemini",
        gemini_api_key="test-key",
        **overrides,
    )
    client = FakeClient(replies)
    return GeminiProvider(settings, client=client), client


def test_prompt_carries_every_fact_and_the_token_rule() -> None:
    prompt = build_prompt(FACTS, DRAFT, [])
    assert "f1 | total | Total revenue | 1769540.66 | currency" in prompt
    assert "auto:0" in prompt and "2025-04-01" in prompt
    assert "Across the whole dataset, total revenue is {{f1}}." in prompt
    assert "rejected" not in prompt

    retry = build_prompt(FACTS, DRAFT, ["18%"])
    assert "18%" in retry and "{{fN}}" in retry


async def test_writes_a_brief_and_records_token_usage() -> None:
    provider, _ = provider_for(
        [
            FakeResponse(
                {
                    "summary": ["Total revenue fell {{f2}} in April 2025."],
                    "findings": ["Revenue ended at {{f1}}."],
                    "next_questions": ["What drove the April dip?"],
                }
            )
        ]
    )
    brief = await generate_brief(FACT_SET, provider)

    assert (brief.provider, brief.model) == ("gemini", "gemini-2.5-flash")
    assert brief.summary == "Total revenue fell {{f2}} in April 2025."
    assert (brief.input_tokens, brief.output_tokens) == (120, 45)


async def test_ungrounded_numbers_are_retried_with_feedback() -> None:
    provider, client = provider_for(
        [
            FakeResponse({"summary": ["Revenue fell 22%."], "findings": [], "next_questions": []}),
            FakeResponse(
                {"summary": ["Revenue fell {{f2}}."], "findings": [], "next_questions": []}
            ),
        ]
    )
    brief = await generate_brief(FACT_SET, provider)

    prompts = [call["contents"] for call in client.models.calls]
    assert len(prompts) == 2
    assert "22%" in prompts[1]  # the rejected number came back as feedback
    assert brief.summary == "Revenue fell {{f2}}."
    assert brief.provider == "gemini"


async def test_a_transient_error_costs_one_attempt_not_the_brief() -> None:
    provider, _ = provider_for(
        [
            errors.APIError(503, {"message": "unavailable"}),
            FakeResponse({"summary": ["Revenue is {{f1}}."], "findings": [], "next_questions": []}),
        ]
    )
    brief = await generate_brief(FACT_SET, provider)

    assert brief.provider == "gemini"
    assert brief.summary == "Revenue is {{f1}}."


async def test_falls_back_to_the_template_when_every_attempt_fails() -> None:
    provider, client = provider_for([errors.APIError(503, {"message": "down"})] * 3)
    brief = await generate_brief(FACT_SET, provider)

    assert len(client.models.calls) == 3
    assert brief.provider == "mock"
    assert brief.summary.startswith("Total revenue fell {{f2}}")
    assert brief.findings == ["A grounded finding."]


async def test_a_hanging_api_times_out_and_falls_back() -> None:
    provider, _ = provider_for(["hang"] * 3, gemini_timeout_s=0.05)
    brief = await asyncio.wait_for(generate_brief(FACT_SET, provider), timeout=5)

    assert brief.provider == "mock"


async def test_a_permanent_error_is_not_retried() -> None:
    # A bad key or a rejected schema fails the same way every time.
    provider, client = provider_for([errors.APIError(400, {"message": "bad request"})] * 3)
    brief = await generate_brief(FACT_SET, provider)

    assert len(client.models.calls) == 1
    assert brief.provider == "mock"


async def test_ungrounded_next_questions_are_dropped() -> None:
    provider, _ = provider_for(
        [
            FakeResponse(
                {
                    "summary": ["Revenue is {{f1}}."],
                    "findings": [],
                    "next_questions": ["Why did it fall 22%?", "What changed in April 2025?"],
                }
            )
        ]
        * 3
    )
    brief = await generate_brief(FACT_SET, provider)

    assert brief.next_questions == ["What changed in April 2025?"]


async def test_an_empty_response_is_transient() -> None:
    provider, _ = provider_for([FakeResponse({}, text=""), FakeResponse(GROUNDED)])
    brief = await generate_brief(FACT_SET, provider)

    assert brief.provider == "gemini"


def test_gemini_needs_a_key() -> None:
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        Settings(database_url="postgresql+asyncpg://x/y", llm_provider="gemini")


def test_the_factory_defaults_to_the_mock() -> None:
    settings = Settings(database_url="postgresql+asyncpg://x/y")
    assert get_provider(settings).provider == "mock"
