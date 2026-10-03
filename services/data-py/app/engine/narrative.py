"""Grounding check for brief text (ADR-010): numbers may only appear as
{{factId}} references to computed facts, or as dates and times.
Port of apps/web/mocks/db/engine/narrative.ts (same patterns, same order).
"""

import re
from collections.abc import Iterable
from typing import Any

MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*"
# Order matters: "April 2025" must match before "Apr 20" can eat "20".
# Keep in step with rule 2 of the prompt in app/llm/prompt.py.
ALLOWED_NUMBER_PATTERNS = [
    re.compile(r"\{\{\w+\}\}"),  # fact references
    re.compile(rf"\b{MONTH}\s+\d{{4}}\b"),  # "April 2025"
    re.compile(rf"\b{MONTH}\s+\d{{1,2}}(?:,\s*\d{{4}})?\b"),  # "Sep 18", "April 3, 2025"
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),  # ISO dates
    re.compile(r"\b\d{1,2}:\d{2}\b"),  # times
    re.compile(r"\b(?:19|20)\d{2}\b"),  # years
]
REFERENCE = re.compile(r"\{\{(\w+)\}\}")
NUMBER = re.compile(r"[-+−]?\$?\d[\d,.]*\s?%?")


def ungrounded_numbers(text: str, facts: Iterable[dict[str, Any]]) -> list[str]:
    """Numbers in a narrative that no fact backs. Empty means the text is valid."""
    known = {fact["id"] for fact in facts}
    unknown = [f"{{{{{ref}}}}}" for ref in REFERENCE.findall(text) if ref not in known]
    rest = text
    for pattern in ALLOWED_NUMBER_PATTERNS:
        rest = pattern.sub(" ", rest)
    return unknown + [n.strip() for n in NUMBER.findall(rest)]


def validate_narrative(text: str, facts: list[dict[str, Any]]) -> bool:
    return not ungrounded_numbers(text, facts)


def keep_grounded(sentences: list[str], facts: list[dict[str, Any]]) -> list[str]:
    """Drops any sentence that fails validation."""
    return [s for s in sentences if validate_narrative(s, facts)]
