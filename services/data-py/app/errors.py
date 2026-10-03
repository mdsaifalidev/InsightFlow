"""RFC 7807 problem responses, matching the web client's ApiError (PRD §9)."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.log import log


class Problem(Exception):
    def __init__(
        self,
        status: int,
        title: str,
        detail: str | None = None,
        errors: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(title)
        self.status = status
        self.title = title
        self.detail = detail
        self.errors = errors
        self.headers = headers


def problem_response(problem: Problem) -> JSONResponse:
    body: dict[str, Any] = {"type": "about:blank", "title": problem.title, "status": problem.status}
    if problem.detail:
        body["detail"] = problem.detail
    if problem.errors:
        body["errors"] = problem.errors
    return JSONResponse(
        body,
        status_code=problem.status,
        media_type="application/problem+json",
        headers=problem.headers,
    )


def not_found(what: str = "Dataset") -> Problem:
    if what == "Dataset":
        return Problem(404, "Dataset not found", "This dataset doesn't exist or was deleted.")
    return Problem(404, f"{what} not found")


def _field_errors(exc: RequestValidationError) -> dict[str, str]:
    errors: dict[str, str] = {}
    for error in exc.errors():
        loc = [str(part) for part in error.get("loc", ()) if part not in ("body", "query", "path")]
        field = ".".join(loc) or "body"
        errors.setdefault(field, str(error.get("msg", "Invalid value.")))
    return errors


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(Problem)
    async def _problem(_: Request, exc: Problem) -> JSONResponse:
        return problem_response(exc)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return problem_response(
            Problem(422, "Validation failed", "Check the highlighted fields.", _field_errors(exc))
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        titles = {404: "Not found", 405: "Method not allowed"}
        return problem_response(
            Problem(exc.status_code, titles.get(exc.status_code, str(exc.detail)))
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", error=str(exc))
        return problem_response(Problem(500, "Something went wrong", "Try again in a moment."))
