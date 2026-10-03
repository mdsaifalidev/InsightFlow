"""Writes the OpenAPI spec to packages/api-types/openapi/data.json.

`create_app()` only builds routes; the lifespan (Postgres, Redis, S3) never
runs, so this needs no infrastructure.
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

OUT = ROOT.parent.parent / "packages/api-types/openapi/data.json"


def main() -> None:
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://spec:spec@127.0.0.1:5432/spec")
    from app.main import create_app

    spec = create_app().openapi()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # newline="" keeps LF on Windows too, so the committed spec is byte-identical
    # wherever it was regenerated — CI's drift check diffs bytes.
    with OUT.open("w", encoding="utf-8", newline="") as file:
        file.write(json.dumps(spec, indent=2) + "\n")
    print(f"data spec written to {OUT}")


if __name__ == "__main__":
    main()
