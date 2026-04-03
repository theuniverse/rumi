from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    database_url: str = Field(default="sqlite+aiosqlite:///./data/scraper.db")
    rsshub_base: str = Field(default="http://wewe-rss:4000")
    wewe_auth_code: str = Field(default="")   # WeWeRSS AUTH_CODE for management API
    openrouter_api_key: str = Field(default="")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1")
    openrouter_site_url: str = Field(default="https://rumi.local")
    openrouter_site_name: str = Field(default="Rumi Event Scraper")
    # Model selection — must be valid OpenRouter model IDs
    # qwen3.5-9b: $0.05/1M input, 256K context, strong Chinese, confirmed available
    model_classify: str = Field(default="qwen/qwen3.5-9b")
    model_extract: str = Field(default="qwen/qwen3.5-9b")
    model_diff: str = Field(default="qwen/qwen3.5-9b")
    # Job concurrency
    rss_fetch_concurrency: int = Field(default=3)
    llm_batch_size: int = Field(default=5)
    # CORS
    cors_origins: list[str] = Field(default=["http://localhost:8888", "http://localhost:5173"])

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
