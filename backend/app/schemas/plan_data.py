"""The frontend's `Plan` (src/core/types.ts), validated before it is stored.

Field names match the TypeScript types exactly. Limits mirror src/core/presets.ts (BODY_LIMITS,
MAX_BODIES) and src/core/item.ts (MIN_ITEM_SIZE, MAX_ITEM_SIZE): keep them in sync.
The server checks structure and ranges only; collisions and gravity are the client's `settle()`.
"""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MAX_BODIES = 3
MAX_ITEMS = 5000
MIN_ITEM_SIZE = 5
MAX_ITEM_SIZE = 3000
# Generous bound for coordinates (cm): bodies are at most 3 x 25 m, the dock is behind them.
MAX_COORD = 100_000
# src/core/presets.ts: ITEM_WEIGHT_LIMIT, BODY_MAX_LOAD_LIMIT (kg).
ITEM_WEIGHT_LIMIT = 30_000
BODY_MAX_LOAD_LIMIT = 60_000

Id = Annotated[str, StringConstraints(min_length=1, max_length=64)]
Color = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
Coord = Annotated[float, Field(ge=-MAX_COORD, le=MAX_COORD)]
ItemSize = Annotated[float, Field(ge=MIN_ITEM_SIZE, le=MAX_ITEM_SIZE)]


class PlanModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Vec3(PlanModel):
    x: Coord
    y: Annotated[float, Field(ge=0, le=MAX_COORD)]
    z: Coord


class ItemDims(PlanModel):
    l: ItemSize  # noqa: E741 — the frontend's field name
    w: ItemSize
    h: ItemSize


class BodyDims(PlanModel):
    l: Annotated[float, Field(ge=100, le=2500)]  # noqa: E741
    w: Annotated[float, Field(ge=100, le=400)]
    h: Annotated[float, Field(ge=100, le=450)]


class Orientation(PlanModel):
    yaw: Literal[0, 90]


def _omit_none(value: object) -> bool:
    return value is None


class CargoBody(PlanModel):
    id: Id
    name: Annotated[str, StringConstraints(max_length=100)]
    kind: Literal["semi", "truck", "trailer"]
    dims: BodyDims
    # Payload capacity, kg. Optional (older plans); omitted from the JSON when not set.
    maxLoad: Annotated[float | None, Field(ge=0, le=BODY_MAX_LOAD_LIMIT, exclude_if=_omit_none)] = None  # noqa: N815


class CargoItem(PlanModel):
    id: Id
    seq: Annotated[int, Field(ge=1, le=1_000_000)]
    name: Annotated[str, StringConstraints(max_length=200)]
    dims: ItemDims
    orientation: Orientation
    pos: Vec3
    color: Color
    # Gross weight, kg. Optional (older plans); omitted from the JSON when not set.
    weight: Annotated[float | None, Field(ge=0, le=ITEM_WEIGHT_LIMIT, exclude_if=_omit_none)] = None


class PlanData(PlanModel):
    bodies: Annotated[list[CargoBody], Field(min_length=1, max_length=MAX_BODIES)]
    items: Annotated[list[CargoItem], Field(max_length=MAX_ITEMS)]
    nextSeq: Annotated[int, Field(ge=1)]  # noqa: N815 — the frontend's field name

    @model_validator(mode="after")
    def _check_ids(self) -> Self:
        for kind, ids in (("bodies", [b.id for b in self.bodies]), ("items", [i.id for i in self.items])):
            if len(ids) != len(set(ids)):
                raise ValueError(f"duplicate id in {kind}")
        # Same rule as loadPlan() on the client: the next number is never taken.
        self.nextSeq = max([self.nextSeq, *(i.seq + 1 for i in self.items)])
        return self


def default_plan_data() -> PlanData:
    """An empty plan with the first vehicle preset of the frontend (Еврофура 13,6 м, тент)."""
    return PlanData(
        bodies=[
            CargoBody(
                id="body-1",
                name="Полуприцеп",
                kind="semi",
                dims=BodyDims(l=1360, w=245, h=270),
                maxLoad=20000,
            )
        ],
        items=[],
        nextSeq=1,
    )
