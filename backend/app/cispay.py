"""cisPay (https://api.cispay.app/docs), the payment provider of PAYMENT_PROVIDER=cispay: its HTTP API and
the reading of its answers. app/billing.py (CisPayProvider) and the webhook in routers/billing.py use it.

- Checkout: POST /payments makes an invoice in kopecks with our payment's id as `order_id`; the customer pays
  on its `payment_url` (card, SBP: the ways the shop has on) and comes back to SITE_URL/billing?payment=<id>.
- The result: cisPay posts every change of the status to the shop's webhook_url (in the cisPay account:
  https://<site>/api/billing/cispay/webhook), signed in X-Signature with HMAC-SHA256 of the raw body keyed by
  the shop's API key. While the return page waits, GET /payments/status is asked too, so a webhook that is
  late or lost (or cannot reach a development machine) does not hold the payment.
- Sandbox transactions (`is_sandbox`: test payments of the cisPay account, and payments of a customer cisPay
  has blocked) are never paid unless CISPAY_SANDBOX=true, which production refuses; their end (declined,
  expired) still closes our payment.
"""

import asyncio
import hashlib
import hmac
import http.client
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Literal

from app.config import Settings
from app.models import Payment

logger = logging.getLogger("app.cispay")

# Seconds for a request to the cisPay API: making an invoice (the customer waits for the payment page), and
# asking a status (the return page polls it; the next poll asks again).
CREATE_TIMEOUT = 15
STATUS_TIMEOUT = 8

State = Literal["pending", "paid", "canceled"]
# PENDING: waiting; PAID; FAILED: declined by the bank; EXPIRED: not paid in time. REFUNDED is handled apart.
_STATES: dict[str, State] = {
    "PENDING": "pending",
    "PAID": "paid",
    "FAILED": "canceled",
    "EXPIRED": "canceled",
}


class CisPayError(Exception):
    """cisPay did not answer, refused, or answered something unexpected."""


def configured(settings: Settings) -> bool:
    return bool(settings.cispay_shop_id and settings.cispay_api_key.get_secret_value())


def _open(request: urllib.request.Request, timeout: float) -> bytes:
    """The network (tests replace it)."""
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def _send(
    settings: Settings,
    method: str,
    path: str,
    query: dict[str, str] | None,
    body: dict[str, Any] | None,
    timeout: float,
) -> dict[str, Any]:
    url = settings.cispay_api_url.rstrip("/") + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    headers = {
        "X-Shop-ID": settings.cispay_shop_id,
        "X-Api-Key": settings.cispay_api_key.get_secret_value(),
        "Accept": "application/json",
        "User-Agent": "Loader3D",
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        answer = json.loads(_open(request, timeout))
    except urllib.error.HTTPError as error:
        try:
            detail = error.read()[:500].decode(errors="replace")
        except OSError:
            detail = ""
        raise CisPayError(f"{method} {path}: HTTP {error.code} {detail}") from error
    except (OSError, http.client.HTTPException, ValueError) as error:  # no connection, timeout, not JSON
        raise CisPayError(f"{method} {path}: {error!r}") from error
    if not isinstance(answer, dict):
        raise CisPayError(f"{method} {path}: the answer is not an object")
    return answer


async def _request(
    settings: Settings,
    method: str,
    path: str,
    *,
    query: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    seconds: float,
) -> dict[str, Any]:
    return await asyncio.to_thread(_send, settings, method, path, query, body, seconds)


async def create_invoice(
    settings: Settings, payment: Payment, description: str, return_url: str | None
) -> tuple[str, str]:
    """An invoice for the payment: (cisPay's id of it, the page where the customer pays)."""
    body: dict[str, Any] = {
        "amount": payment.amount * 100,
        "currency": "RUB",
        "order_id": str(payment.id),
        # Required when the customer chooses the way to pay on the cisPay page (and for SBP).
        "customer_id": str(payment.user_id or payment.id),
        "description": description,
    }
    if return_url:
        # After a failure cisPay shows a button back rather than leaving at once: the customer may retry.
        body["redirect_success_url"] = body["redirect_fail_url"] = return_url
    answer = await _request(settings, "POST", "/payments", body=body, seconds=CREATE_TIMEOUT)
    provider_id, url = answer.get("id"), answer.get("payment_url")
    if (
        not isinstance(provider_id, str)
        or not isinstance(url, str)
        or not url.startswith(("https://", "http://"))
    ):
        raise CisPayError(f"POST /payments: no id or payment_url in {sorted(answer)}")
    return provider_id, url


async def fetch_state(settings: Settings, payment: Payment) -> State | None:
    """Asks cisPay how the payment stands (see state_of)."""
    if payment.provider_payment_id:
        query = {"id": payment.provider_payment_id}
    else:
        query = {"order_id": str(payment.id)}
    answer = await _request(settings, "GET", "/payments/status", query=query, seconds=STATUS_TIMEOUT)
    return state_of(settings, payment, answer)


def signature_ok(settings: Settings, body: bytes, signature: str) -> bool:
    """X-Signature of a webhook: hex HMAC-SHA256 of the raw body keyed by the shop's API key."""
    key = settings.cispay_api_key.get_secret_value()
    if not key or not signature:
        return False
    expected = hmac.new(key.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


def state_of(settings: Settings, payment: Payment, data: dict[str, Any]) -> State | None:
    """What a webhook or a status answer says about our payment. None: nothing to act on (an answer that does
    not match the payment, a sandbox payment that says «paid», a refund — logged)."""
    status = data.get("status")
    if data.get("order_id") != str(payment.id):
        logger.warning("cisPay: order %r is not payment %s", data.get("order_id"), payment.id)
        return None
    if payment.provider_payment_id and data.get("id") != payment.provider_payment_id:
        logger.warning("cisPay: transaction %r is not the invoice of payment %s", data.get("id"), payment.id)
        return None
    store = data.get("store_id")
    if store is not None and str(store).lower() != settings.cispay_shop_id.lower():
        logger.warning("cisPay: payment %s reported for another shop %r", payment.id, store)
        return None
    if status == "REFUNDED":
        # Refunds are made by the shop in the cisPay account: whoever made it decides about the tier.
        logger.warning("cisPay: payment %s was refunded; the tier is left as it is", payment.id)
        return None
    state = _STATES.get(status) if isinstance(status, str) else None
    if state is None:
        logger.warning("cisPay: unknown status %r of payment %s", status, payment.id)
        return None
    if state != "paid":
        return state
    if data.get("is_sandbox") and not settings.cispay_sandbox:
        logger.warning("cisPay: payment %s is paid in the sandbox; not counted", payment.id)
        return None
    # Kopecks of the invoice (a crypto payment is reported in USD cents: its amount is not compared).
    rub = data.get("currency", "RUB") == "RUB"
    if rub and data.get("amount") != payment.amount * 100:
        logger.error(
            "cisPay: payment %s is paid with %r kopecks instead of %s; not applied",
            payment.id,
            data.get("amount"),
            payment.amount * 100,
        )
        return None
    return state
