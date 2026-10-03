"""Provider-agnostic LLM interface (ADR-010). A provider only writes text:
it receives computed facts plus a template draft and may cite numbers only as
{{factId}} references. Output is validated by app/llm/brief.py.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol

from app.engine.facts import Draft


class TransientLLMError(Exception):
    """A timeout or a 5xx/429: worth spending another attempt on."""


@dataclass
class BriefText:
    summary: list[str]
    findings: list[str]
    next_questions: list[str]
    input_tokens: int | None = None
    output_tokens: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class LLMProvider(Protocol):
    provider: str
    model: str

    async def write(
        self, facts: list[dict[str, Any]], draft: Draft, feedback: list[str]
    ) -> BriefText:
        """Returns brief sentences. `feedback` lists problems with the previous
        attempt (ungrounded numbers), empty on the first try."""
        ...
