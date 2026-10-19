from typing import Any

from fastapi import HTTPException, status


class ApiError(HTTPException):
    """Error with a stable machine-readable `code` and a Russian `message` for the UI.

    Response body: {"detail": {"code": "...", "message": "...", ...extra}}.
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        headers: dict[str, str] | None = None,
        **extra: Any,
    ) -> None:
        super().__init__(status_code, {"code": code, "message": message, **extra}, headers)
        self.code = code


def unauthorized(code: str = "not_authenticated", message: str = "Требуется вход") -> ApiError:
    return ApiError(status.HTTP_401_UNAUTHORIZED, code, message, headers={"WWW-Authenticate": "Bearer"})


def not_found(code: str, message: str) -> ApiError:
    return ApiError(status.HTTP_404_NOT_FOUND, code, message)
