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
