"""Facts engine and grounded-brief parity with the TypeScript mock, plus the
validator and the provider retry loop.
"""

from typing import Any

import pytest

from app.engine.facts import Draft, FactSet, build_facts
from app.engine.narrative import ungrounded_numbers, validate_narrative
from app.llm.base import BriefText, TransientLLMError
from app.llm.brief import generate_brief
from app.llm.mock import MockProvider
from tests.test_engine_query import SAMPLES, load, same


async def brief_for(key: str) -> dict[str, Any]:
    golden, frame, columns = load(key)
    widgets = [
        {"id": f"auto:{i}", "kind": "auto", "spec": spec}
        for i, spec in enumerate(golden["autoSpecs"])
    ]
    fact_set = build_facts(frame, columns, golden["dateColumn"], widgets)
    brief = await generate_brief(fact_set, MockProvider())
    return {
        "datasetId": "x",
        "summary": brief.summary,
        "findings": brief.findings,
        "nextQuestions": brief.next_questions,
        "facts": fact_set.facts,
        "anomalies": fact_set.anomalies,
        "provider": brief.provider,
        "model": brief.model,
    }


@pytest.mark.parametrize("key", SAMPLES)
async def test_insight_matches_the_typescript_engine(key: str) -> None:
    golden = load(key)[0]
    same(await brief_for(key), golden["insight"])


async def test_planted_stories_are_found() -> None:
    orders = await brief_for("orders")
    assert "fell {{f2}} in April 2025, driven mostly by Electronics (category)" in orders["summary"]
    assert orders["anomalies"][0]["at"] == "2025-11-28"
    saas = await brief_for("saas")
    assert saas["summary"].startswith("Churned accounts spiked")
    assert "in June 2025, far above the usual level, with Starter (plan)" in saas["summary"]
    weblogs = await brief_for("weblogs")
    assert weblogs["anomalies"][0] == {
        **weblogs["anomalies"][0],
        "at": "2025-09-18T16:00",
        "direction": "spike",
    }
    assert "/api/checkout (path)" in weblogs["summary"]


def test_validator_matches_the_mock() -> None:
    facts = [{"id": "f1"}]
    assert ungrounded_numbers("Revenue fell 18% in April.", facts) == ["18%"]
    assert ungrounded_numbers("It cost $1,200 in total.", facts) == ["$1,200"]
    assert ungrounded_numbers("See {{f9}}.", facts) == ["{{f9}}"]
    assert validate_narrative(
        "Revenue fell {{f1}} in April 2025, on Sep 18, at 14:00 and on 2025-04-03.", facts
    )


class ScriptedProvider:
    provider = "scripted"
    model = "test"

    def __init__(self, replies: list[BriefText | Exception]) -> None:
        self.replies = replies
        self.feedback: list[list[str]] = []

    async def write(
        self, facts: list[dict[str, Any]], draft: Draft, feedback: list[str]
    ) -> BriefText:
        self.feedback.append(feedback)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


FACTS = FactSet(
    facts=[{"id": "f1", "kind": "total", "label": "Total", "value": 3, "format": "number"}],
    anomalies=[],
    draft=Draft(summary=["Total is {{f1}}."], findings=["A grounded finding."], questions=["Why?"]),
)


async def test_brief_retries_with_feedback_then_accepts_grounded_text() -> None:
    provider = ScriptedProvider(
        [
            BriefText(summary=["Revenue is 42."], findings=[], next_questions=[]),
            BriefText(
                summary=["Revenue is {{f1}}."], findings=["Up {{f1}}."], next_questions=["Q"]
            ),
        ]
    )
    brief = await generate_brief(FACTS, provider)
    assert provider.feedback == [[], ["42."]]
    assert brief.summary == "Revenue is {{f1}}."
    assert (brief.provider, brief.model) == ("scripted", "test")


async def test_brief_drops_ungrounded_sentences_after_the_retries() -> None:
    bad = BriefText(
        summary=["Up 10%.", "Total is {{f1}}."], findings=["9 items."], next_questions=[]
    )
    provider = ScriptedProvider([bad, bad, bad])
    brief = await generate_brief(FACTS, provider)
    assert len(provider.feedback) == 3
    assert brief.summary == "Total is {{f1}}."
    assert brief.findings == []


async def test_brief_retries_a_transient_error_then_succeeds() -> None:
    provider = ScriptedProvider(
        [
            TransientLLMError("503"),
            BriefText(summary=["Total is {{f1}}."], findings=[], next_questions=["Q"]),
        ]
    )
    brief = await generate_brief(FACTS, provider)
    assert provider.feedback == [[], []]
    assert brief.provider == "scripted"


async def test_brief_does_not_retry_a_permanent_error() -> None:
    # A bad key fails the same way every time; one attempt, then the template.
    provider = ScriptedProvider([RuntimeError("bad api key")] * 3)
    brief = await generate_brief(FACTS, provider)
    assert len(provider.feedback) == 1
    assert brief.provider == "mock"
    assert brief.summary == "Total is {{f1}}."
    assert brief.findings == ["A grounded finding."]


async def test_brief_falls_back_to_the_template_when_every_attempt_fails() -> None:
    provider = ScriptedProvider([TransientLLMError("outage")] * 3)
    brief = await generate_brief(FACTS, provider)
    assert provider.replies == []
    assert brief.provider == "mock"


async def test_brief_falls_back_when_no_sentence_survives() -> None:
    # Everything the provider wrote was ungrounded: an empty brief is not a brief.
    ungrounded = BriefText(summary=["Up 10%."], findings=["9 items."], next_questions=[])
    brief = await generate_brief(FACTS, ScriptedProvider([ungrounded] * 3))
    assert brief.provider == "mock"
    assert brief.summary == "Total is {{f1}}."
