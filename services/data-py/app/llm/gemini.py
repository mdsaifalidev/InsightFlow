"""Google Gemini narrator (ADR-010). The model only turns computed facts into
sentences; app/llm/brief.py validates that every number it wrote is a fact.
"""

import asyncio
from typing import Any

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from app.config import Settings
from app.engine.facts import Draft
from app.llm.base import BriefText, TransientLLMError
from app.llm.prompt import SYSTEM, build_prompt
from app.log import log

# Worth another attempt; anything else (a bad key, a rejected schema) would
# fail the same way three times in a row.
RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


class BriefResponse(BaseModel):
    """The structured output contract; passed to the API as a JSON schema."""

    summary: list[str]
    findings: list[str]
    next_questions: list[str]


class GeminiProvider:
    provider = "gemini"

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self.model = settings.gemini_model
        self.timeout = settings.gemini_timeout_s
        key = settings.gemini_api_key
        self._client = client or genai.Client(api_key=key.get_secret_value() if key else None)

    def _config(self) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            system_instruction=SYSTEM,
            response_mime_type="application/json",
            response_schema=BriefResponse,
            # Narration, not reasoning: low temperature, no thinking budget.
            temperature=0.2,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            # No tools are offered; without this the SDK warns on every call.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

    async def write(
        self, facts: list[dict[str, Any]], draft: Draft, feedback: list[str]
    ) -> BriefText:
        prompt = build_prompt(facts, draft, feedback)
        try:
            # The lazy insight path runs inside an HTTP request, so cap the wait.
            async with asyncio.timeout(self.timeout):
                response = await self._client.aio.models.generate_content(
                    model=self.model, contents=prompt, config=self._config()
                )
        except TimeoutError as error:
            raise TransientLLMError(f"gemini timed out after {self.timeout}s") from error
        except errors.APIError as error:
            if error.code in RETRYABLE_STATUS:
                raise TransientLLMError(f"gemini {error.code}: {error.message}") from error
            raise
        except httpx.TransportError as error:
            raise TransientLLMError(f"gemini transport error: {error}") from error

        if not response.text:
            # Truncated output or a safety block: the next attempt may differ.
            reason = getattr(response, "candidates", None)
            raise TransientLLMError(f"gemini returned no text (candidates={reason})")
        text = BriefResponse.model_validate_json(response.text)
        usage = getattr(response, "usage_metadata", None)
        log.info(
            "brief_generated",
            provider=self.provider,
            model=self.model,
            retry=bool(feedback),
            input_tokens=getattr(usage, "prompt_token_count", None),
            output_tokens=getattr(usage, "candidates_token_count", None),
        )
        return BriefText(
            summary=text.summary,
            findings=text.findings,
            next_questions=text.next_questions,
            input_tokens=getattr(usage, "prompt_token_count", None),
            output_tokens=getattr(usage, "candidates_token_count", None),
        )
