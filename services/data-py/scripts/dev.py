"""Native development: migrate, then run the API (reload) and the ARQ worker
(restarted by watchfiles) until Ctrl+C. Docker runs these as two services."""

import os
import subprocess
import sys

PORT = os.environ.get("PORT", "8000")


def main() -> int:
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
    processes = [
        subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:create_app",
                "--factory",
                "--reload",
                "--port",
                PORT,
            ]
        ),
        subprocess.Popen(
            [
                sys.executable,
                "-m",
                "watchfiles",
                "--filter",
                "python",
                "arq app.worker.WorkerSettings",
                "app",
            ]
        ),
    ]
    try:
        return processes[0].wait()
    except KeyboardInterrupt:
        return 0
    finally:
        for process in processes:
            process.terminate()


if __name__ == "__main__":
    raise SystemExit(main())
