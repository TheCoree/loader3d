import re
from email.utils import parseaddr
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parent.parent
# The repository root: its .env (the deployment settings, .env.example) is read in development too, so
# one TIERS_ENABLED switches the frontend build and the API alike. backend/.env overrides it.
ROOT_DIR = BACKEND_DIR.parent

# Used only when ENVIRONMENT=development and JWT_SECRET is not set; production refuses to start with it.
DEV_JWT_SECRET = "loader3d-development-secret-do-not-use-in-production"

_SHA256_HEX = re.compile(r"[0-9a-f]{64}")


class Settings(BaseSettings):
    """Runtime configuration from environment variables (and backend/.env in development)."""

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    environment: Literal["development", "production"] = "development"

    # sqlite+aiosqlite:///path.db in development, postgresql+asyncpg://user@host:5432/db in production.
    database_url: str = f"sqlite+aiosqlite:///{(BACKEND_DIR / 'loader3d.db').as_posix()}"
    # Kept out of the URL so any characters work; overrides the password in DATABASE_URL.
    database_password: SecretStr | None = None

    jwt_secret: SecretStr = SecretStr(DEV_JWT_SECRET)
    access_token_ttl_minutes: int = Field(15, ge=1, le=24 * 60)
    refresh_token_ttl_days: int = Field(30, ge=1, le=365)

    registration_open: bool = True
    # New accounts confirm their email with a 6-digit code before they can use plans (app/verification.py).
    # Off: accounts count as confirmed right away.
    email_verification: bool = True
    # How the code is delivered (app/mail.py). "console": written to the API log (development, or until a
    # mailbox for the domain exists). "smtp": sent through the SMTP server below.
    mail_backend: Literal["console", "smtp"] = "console"
    # Sender of the letters: "Loader3D <noreply@example.com>" or just the address. Required for "smtp".
    mail_from: str = ""
    smtp_host: str = ""
    smtp_port: int = Field(465, ge=1, le=65535)
    # "ssl": TLS from the first byte (port 465); "starttls": plain connection upgraded to TLS (port 587);
    # "none": no encryption (a relay on the local network only).
    smtp_security: Literal["ssl", "starttls", "none"] = "ssl"
    # Empty username: no login (a relay that trusts the server's address).
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    # Letters to companies from the admin panel (app/outreach.py) and the mailbox its «Почта» tab reads
    # (app/inbox.py, IMAP on SMTP_HOST:IMAP_PORT). The mailbox's login and password send the letters too, so
    # the sender is that mailbox or one of its aliases (docker-mailserver refuses other senders). Empty:
    # MAIL_FROM and SMTP_USERNAME / SMTP_PASSWORD.
    outreach_from: str = ""
    outreach_username: str = ""
    outreach_password: SecretStr = SecretStr("")
    imap_port: int = Field(993, ge=1, le=65535)
    # Public address of the site (https://example.com): the link at the bottom of the letters, and where the
    # customer comes back after paying (cisPay). May be empty without online payment.
    site_url: str = ""
    # Subscription tiers (app/tiers.py). Off: no limits, and neither the API nor the site mention tiers.
    tiers_enabled: bool = False
    # Online payment of tiers (app/billing.py), with TIERS_ENABLED only. "none": paid tiers by a request
    # and an admin; "test": a fake payment page that pays or cancels at a click (development only);
    # "cispay": cisPay (app/cispay.py), with the shop below.
    payment_provider: Literal["none", "test", "cispay"] = "none"
    # The cisPay shop (its account, «Настройки магазина»): the id (UUID) and the secret key cis_sec_…, which
    # also signs the webhooks.
    cispay_shop_id: str = ""
    cispay_api_key: SecretStr = SecretStr("")
    cispay_api_url: str = "https://api.cispay.app"
    # Count the sandbox payments of the cisPay account as paid: development only.
    cispay_sandbox: bool = False
    # Visit statistics of the public pages for the admin panel (app/analytics.py), and how many days
    # the raw visits are kept.
    analytics_enabled: bool = True
    analytics_retention_days: int = Field(400, ge=30, le=3650)
    # Addresses of the reverse proxy whose X-Forwarded-For is trusted for the client's IP (rate limits,
    # the sessions list). Compose sets "*": the api is reachable only through Caddy there.
    forwarded_allow_ips: str = "127.0.0.1"
    # Comma-separated origins allowed to call the API cross-origin.
    # Empty: same-origin only, which is how Caddy (production) and the Vite proxy (development) serve it.
    cors_origins: Annotated[list[str], NoDecode] = []
    # The owner's phone widget (routers/widget.py, tools/scriptable): SHA-256 of its keys, comma-separated
    # (one per device), from `python -m app widget-key`. The keys themselves are never stored on the server.
    # Empty: GET /api/widget/stats does not exist (404).
    widget_key_sha256: Annotated[list[str], NoDecode] = []

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("widget_key_sha256", mode="before")
    @classmethod
    def _split_hashes(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.split(",")
        if isinstance(value, list):
            hashes = [str(item).strip().lower() for item in value if str(item).strip()]
            if not all(_SHA256_HEX.fullmatch(item) for item in hashes):
                raise ValueError(
                    "WIDGET_KEY_SHA256 takes the SHA-256 of a key (64 hex characters) printed by "
                    "`python -m app widget-key`, not the key itself"
                )
            return hashes
        return value

    @model_validator(mode="after")
    def _check_production(self) -> Settings:
        if self.environment == "production":
            secret = self.jwt_secret.get_secret_value()
            if secret == DEV_JWT_SECRET or len(secret) < 32:
                raise ValueError("JWT_SECRET must be set to a random string of at least 32 characters")
            if self.payment_provider == "test":
                raise ValueError("PAYMENT_PROVIDER=test gives «Pro» away for free: development only")
            if self.cispay_sandbox:
                raise ValueError("CISPAY_SANDBOX=true counts test payments as paid: development only")
            if self.payment_provider == "cispay" and not self.site_url:
                raise ValueError(
                    "PAYMENT_PROVIDER=cispay needs SITE_URL: customers return there after paying"
                )
        if self.payment_provider == "cispay" and not (
            self.cispay_shop_id and self.cispay_api_key.get_secret_value()
        ):
            raise ValueError("PAYMENT_PROVIDER=cispay needs CISPAY_SHOP_ID and CISPAY_API_KEY of the shop")
        if self.mail_backend == "smtp":
            if not self.smtp_host:
                raise ValueError("MAIL_BACKEND=smtp needs SMTP_HOST")
            if "@" not in parseaddr(self.mail_from)[1]:
                raise ValueError('MAIL_BACKEND=smtp needs MAIL_FROM, e.g. "Loader3D <noreply@example.com>"')
        return self

    @property
    def outreach_sender(self) -> str:
        return self.outreach_from or self.mail_from

    @property
    def outreach_login(self) -> tuple[str, str]:
        """The mailbox of the letters to companies: its login and password (SMTP and IMAP)."""
        if self.outreach_username:
            return self.outreach_username, self.outreach_password.get_secret_value()
        return self.smtp_username, self.smtp_password.get_secret_value()

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def sqlalchemy_url(self) -> str:
        url = make_url(self.database_url)
        if self.database_password is not None:
            url = url.set(password=self.database_password.get_secret_value())
        return url.render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
