"""Deterministic provider for development and tests: the template draft itself,
the same narrative the MSW mock produces.
"""

from typing import Any

from app.engine.facts import Draft
from app.llm.base import BriefText


class MockProvider:
    provider = "mock"
    model = "template-v1"

    async def write(
        self, facts: list[dict[str, Any]], draft: Draft, feedback: list[str]
    ) -> BriefText:
        return BriefText(
            summary=[*draft.lead, *draft.summary],
            findings=list(draft.findings),
            next_questions=list(draft.questions),
        )
