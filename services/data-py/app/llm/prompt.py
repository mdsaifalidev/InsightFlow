"""Prompt for a real narrator (ADR-010). The model never sees the data, only
the facts the Polars engine computed, and may cite numbers only as {{factId}}.
"""

import json
from typing import Any

from app.engine.facts import Draft

# Rule 2's list of allowed literals must match ALLOWED_NUMBER_PATTERNS in
# app/engine/narrative.py. If they drift, the validator rejects text the prompt
# permitted: every brief burns three attempts and quietly lands on the template.
SYSTEM = """You are a data analyst writing an executive brief about a dataset.

You are given FACTS that were computed from the data, each with an id (f1, f2, ...).
You are also given a DRAFT written by a template, as a reference for what matters.

Rules, in order of importance:
1. Never write a number yourself. Every quantity must be the token {{fN}} of the
   fact it comes from, for example: "Revenue fell {{f2}} in April 2025."
2. The only literals you may write are dates, months, years and clock times
   (April 2025, Sep 18, 2025-04-03, 14:00). No other digits, percentages,
   currency amounts or counts.
3. Never state a relationship the facts do not support, and never invent a
   cause. A share of 100% may be called the whole of a move; a smaller share
   may not.
4. Plain business English. No headings, no markdown, no bullet characters.

Write:
- summary: complete sentences, at most 150 words in total, leading with what
  changed and why it matters.
- findings: 3 to 5 sentences, each a single specific observation.
- next_questions: 2 to 3 questions an analyst would ask next. No numbers at all.
"""


def render_facts(facts: list[dict[str, Any]]) -> str:
    lines = []
    for fact in facts:
        ref = fact.get("ref")
        where = f" (on chart {ref['widgetId']} at {ref.get('x')})" if ref else ""
        lines.append(
            f"{fact['id']} | {fact.get('kind', '')} | {fact.get('label', '')} | "
            f"{json.dumps(fact.get('value'))} | {fact.get('format', '')}{where}"
        )
    return "\n".join(lines)


def render_draft(draft: Draft) -> str:
    parts = [*draft.lead, *draft.summary]
    return "\n".join(
        [
            "Summary: " + (" ".join(parts) if parts else "(none)"),
            *[f"Finding: {f}" for f in draft.findings],
            *[f"Question: {q}" for q in draft.questions],
        ]
    )


def build_prompt(facts: list[dict[str, Any]], draft: Draft, feedback: list[str]) -> str:
    """The user turn: facts, the template draft, and what went wrong last time."""
    sections = [
        "FACTS (id | kind | label | value | format):",
        render_facts(facts) or "(none)",
        "",
        "DRAFT (template text, already grounded):",
        render_draft(draft),
    ]
    if feedback:
        sections += [
            "",
            "Your previous attempt was rejected: these numbers are not in the facts: "
            + ", ".join(feedback)
            + ". Rewrite those sentences using the {{fN}} token of a fact above, "
            "or leave the number out.",
        ]
    return "\n".join(sections)
