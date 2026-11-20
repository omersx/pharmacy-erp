from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Union
from pydantic import field_validator
import json

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_DEFAULT_DB_PATH = (_BASE_DIR / "data" / "pharmacy.db").as_posix()

class Settings(BaseSettings):
    APP_NAME: str = "Pharma ERP"
    APP_ENV: str = "development"
    DEBUG: bool = True
    DATABASE_URL: str = f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}"
    SECRET_KEY: str = "supersecretkey_change_in_production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: Union[List[str], str] = ["*"]
    MULTI_BRANCH_ENABLED: bool = False

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def resolve_sqlite_path(cls, v: str) -> str:
        if "sqlite" in v and "./data/" in v:
            return f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}"
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v
    
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
