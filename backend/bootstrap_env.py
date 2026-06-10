"""Load `.env` from ZhiPath project root (parent of `backend/`) regardless of cwd."""
from pathlib import Path

from dotenv import load_dotenv

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def load_project_env() -> None:
    if _ENV_FILE.is_file():
        load_dotenv(_ENV_FILE, override=True)
    else:
        load_dotenv(override=True)
