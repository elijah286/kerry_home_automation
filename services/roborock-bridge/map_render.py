"""Decode Roborock get_map_v1 payload to PNG bytes (vacuum-map-parser-roborock)."""

from __future__ import annotations

import io
import logging
from typing import Optional

from vacuum_map_parser_base.config.color import ColorsPalette
from vacuum_map_parser_base.config.drawable import Drawable
from vacuum_map_parser_base.config.image_config import ImageConfig
from vacuum_map_parser_base.config.size import Sizes
from vacuum_map_parser_base.config.text import Text
from vacuum_map_parser_base.image_generator import ImageGenerator
from vacuum_map_parser_roborock.map_data_parser import RoborockMapDataParser

_LOGGER = logging.getLogger(__name__)

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

# Mirrors common HA map layers (skip photo obstacles to avoid extra deps / failures)
_DEFAULT_DRAWABLES: list[Drawable] = [
    Drawable.CHARGER,
    Drawable.VACUUM_POSITION,
    Drawable.PATH,
    Drawable.MOP_PATH,
    Drawable.GOTO_PATH,
    Drawable.PREDICTED_PATH,
    Drawable.NO_GO_AREAS,
    Drawable.NO_MOPPING_AREAS,
    Drawable.NO_CARPET_AREAS,
    Drawable.VIRTUAL_WALLS,
    Drawable.ZONES,
    Drawable.OBSTACLES,
    Drawable.IGNORED_OBSTACLES,
    Drawable.ROOM_NAMES,
    Drawable.CLEANED_AREA,
]


def raw_map_to_png(raw: object) -> Optional[bytes]:
    """Turn get_map_v1 response into PNG bytes, or None if unavailable."""
    if raw is None:
        return None
    if isinstance(raw, (bytes, bytearray)):
        data = bytes(raw)
    elif isinstance(raw, str):
        data = raw.encode("latin-1")
    else:
        _LOGGER.debug("Unexpected map payload type: %s", type(raw))
        return None

    if len(data) < 32:
        return None

    if data.startswith(_PNG_MAGIC):
        return data

    palette = ColorsPalette()
    sizes = Sizes()
    image_config = ImageConfig()
    texts: list[Text] = []

    try:
        parser = RoborockMapDataParser(palette, sizes, list(_DEFAULT_DRAWABLES), image_config, texts)
        map_data = parser.parse(data)
    except Exception:
        _LOGGER.debug("Roborock map parse failed", exc_info=True)
        return None

    if map_data is None or map_data.image is None:
        return None

    try:
        gen = ImageGenerator(palette, sizes, list(_DEFAULT_DRAWABLES), image_config, texts)
        gen.draw_map(map_data)
    except Exception:
        _LOGGER.debug("Roborock map draw failed", exc_info=True)
        return None

    buf = io.BytesIO()
    try:
        map_data.image.save(buf, format="PNG")
    except Exception:
        _LOGGER.debug("Roborock map PNG encode failed", exc_info=True)
        return None
    return buf.getvalue()


def extract_rooms_from_map(raw: object) -> list[dict]:
    """Extract room id + name + center from a raw map payload, or [] on failure."""
    if raw is None:
        return []
    if isinstance(raw, (bytes, bytearray)):
        data = bytes(raw)
    elif isinstance(raw, str):
        data = raw.encode("latin-1")
    else:
        return []

    if len(data) < 32 or data.startswith(_PNG_MAGIC):
        return []

    try:
        parser = RoborockMapDataParser(
            ColorsPalette(), Sizes(), list(_DEFAULT_DRAWABLES), ImageConfig(), []
        )
        map_data = parser.parse(data)
    except Exception:
        return []

    if map_data is None:
        return []

    rooms_out: list[dict] = []
    rooms = getattr(map_data, "rooms", None) or {}
    try:
        items = rooms.items() if isinstance(rooms, dict) else [(getattr(r, "number", i), r) for i, r in enumerate(rooms)]
    except Exception:
        items = []

    for key, room in items:
        try:
            rid = int(key)
        except (TypeError, ValueError):
            continue
        name = getattr(room, "name", None) or f"Room {rid}"
        cx = getattr(room, "x0", None)
        cy = getattr(room, "y0", None)
        x1 = getattr(room, "x1", None)
        y1 = getattr(room, "y1", None)
        if cx is not None and x1 is not None:
            center_x = int((cx + x1) / 2)
        else:
            center_x = int(cx) if cx is not None else None
        if cy is not None and y1 is not None:
            center_y = int((cy + y1) / 2)
        else:
            center_y = int(cy) if cy is not None else None
        rooms_out.append({
            "id": rid,
            "name": str(name),
            "center_x": center_x,
            "center_y": center_y,
        })
    return rooms_out
