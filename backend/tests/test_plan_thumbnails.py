"""Preview pictures of plans (PUT/GET /api/plans/{id}/thumbnail)."""

import httpx
import pytest

from app.routers.plans import THUMBNAIL_MAX_BYTES
from tests.conftest import ClientFactory, error_code, register

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
async def anna(client: httpx.AsyncClient) -> httpx.AsyncClient:
    await register(client, tier="pro")
    return client


async def _plan(client: httpx.AsyncClient) -> dict:
    return (await client.post("/api/plans", json={"name": "Рейс"})).json()


async def _put(
    client: httpx.AsyncClient, plan_id: str, body: bytes, media_type: str = "image/jpeg"
) -> httpx.Response:
    return await client.put(
        f"/api/plans/{plan_id}/thumbnail", content=body, headers={"content-type": media_type}
    )


async def test_new_plan_has_no_thumbnail(anna: httpx.AsyncClient) -> None:
    plan = await _plan(anna)
    assert plan["thumbnailAt"] is None
    assert error_code(await anna.get(f"/api/plans/{plan['id']}/thumbnail")) == "thumbnail_not_found"


async def test_upload_and_read_back_without_touching_the_version(anna: httpx.AsyncClient) -> None:
    plan = await _plan(anna)
    response = await _put(anna, plan["id"], JPEG)
    assert response.status_code == 200, response.text
    thumbnail_at = response.json()["thumbnailAt"]

    image = await anna.get(f"/api/plans/{plan['id']}/thumbnail")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert image.content == JPEG
    assert "immutable" in image.headers["cache-control"]

    after = (await anna.get(f"/api/plans/{plan['id']}")).json()
    assert after["version"] == plan["version"]
    assert after["updatedAt"] == plan["updatedAt"]
    assert after["thumbnailAt"] == thumbnail_at
    listed = (await anna.get("/api/plans")).json()["items"][0]
    assert listed["thumbnailAt"] == thumbnail_at

    # The editor's autosave with the version it had still works.
    saved = await anna.patch(f"/api/plans/{plan['id']}", json={"version": plan["version"], "name": "Новое"})
    assert saved.status_code == 200, saved.text


async def test_replacing_the_picture(anna: httpx.AsyncClient) -> None:
    plan = await _plan(anna)
    await _put(anna, plan["id"], JPEG)
    assert (await _put(anna, plan["id"], PNG, "image/png")).status_code == 200
    image = await anna.get(f"/api/plans/{plan['id']}/thumbnail")
    assert image.headers["content-type"] == "image/png"
    assert image.content == PNG


@pytest.mark.parametrize(
    ("body", "media_type", "status", "code"),
    [
        (JPEG, "text/plain", 415, "unsupported_image"),
        (b"not an image", "image/jpeg", 400, "invalid_image"),
        (b"RIFF\x00\x00\x00\x00WAVE", "image/webp", 400, "invalid_image"),
        (JPEG + b"\x00" * THUMBNAIL_MAX_BYTES, "image/jpeg", 413, "image_too_large"),
    ],
    ids=["media-type", "garbage", "fake-webp", "too-large"],
)
async def test_bad_uploads(
    anna: httpx.AsyncClient, body: bytes, media_type: str, status: int, code: str
) -> None:
    plan = await _plan(anna)
    response = await _put(anna, plan["id"], body, media_type)
    assert response.status_code == status
    assert error_code(response) == code


async def test_other_users_cannot_see_or_replace_it(
    anna: httpx.AsyncClient, make_client: ClientFactory
) -> None:
    plan = await _plan(anna)
    await _put(anna, plan["id"], JPEG)
    boris = await make_client()
    await register(boris, "boris@example.com")
    assert (await boris.get(f"/api/plans/{plan['id']}/thumbnail")).status_code == 404
    assert (await _put(boris, plan["id"], PNG, "image/png")).status_code == 404


async def test_duplicate_keeps_the_picture_and_delete_removes_it(anna: httpx.AsyncClient) -> None:
    plan = await _plan(anna)
    await _put(anna, plan["id"], JPEG)
    copy = (await anna.post(f"/api/plans/{plan['id']}/duplicate", json={})).json()
    assert copy["thumbnailAt"] is not None
    assert (await anna.get(f"/api/plans/{copy['id']}/thumbnail")).content == JPEG

    assert (await anna.delete(f"/api/plans/{plan['id']}")).status_code == 204
    assert (await anna.get(f"/api/plans/{plan['id']}/thumbnail")).status_code == 404
    assert (await anna.get(f"/api/plans/{copy['id']}/thumbnail")).status_code == 200
