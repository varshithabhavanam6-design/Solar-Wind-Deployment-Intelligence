"""
OpenStreetMap GIS integration via the public Overpass API.

Runs ONE combined Overpass query that asks for counts (not full geometry)
of roads, power infrastructure, and water bodies near a point, plus a small,
capped sample of land-use tags. This keeps the request lightweight — no
full-geometry downloads — while still answering the Milestone 1 questions:
"are there nearby roads/power/water, and what's the land use nearby?"

Overpass docs: https://wiki.openstreetmap.org/wiki/Overpass_API

NOTE: overpass-api.de returns HTTP 406 for requests that don't send an
explicit User-Agent and Content-Type — it treats anonymous/default-header
clients (like httpx's default) as suspicious. Both are set below, sourced
from config.py so they're configurable via .env. A fallback mirror endpoint
is tried automatically if the primary one fails.
"""

from __future__ import annotations

import httpx
from typing import Optional

from ..config import settings

# Tags considered "power infrastructure" for this GIS check.
_POWER_TAGS = ["line", "substation", "tower", "pole", "generator", "plant", "cable"]


def _build_overpass_query(lat: float, lon: float, radius_m: int) -> str:
    power_filter = "|".join(_POWER_TAGS)

    return f"""
    [out:json][timeout:20];
    (
      way["highway"](around:{radius_m},{lat},{lon});
    )->.roads;
    (
      node["power"~"^({power_filter})$"](around:{radius_m},{lat},{lon});
      way["power"~"^({power_filter})$"](around:{radius_m},{lat},{lon});
    )->.power;
    (
      way["natural"="water"](around:{radius_m},{lat},{lon});
      way["waterway"](around:{radius_m},{lat},{lon});
      relation["natural"="water"](around:{radius_m},{lat},{lon});
    )->.water;
    (
      way["landuse"](around:{radius_m},{lat},{lon});
    )->.landuse;
    .roads out count;
    .power out count;
    .water out count;
    .landuse out tags 15;
    """


def _is_count_element(element: dict) -> bool:
    tags = element.get("tags", {})
    return set(tags.keys()) == {"total", "nodes", "ways", "relations"}


def _parse_overpass_response(payload: dict) -> dict:
    elements = payload.get("elements", [])

    # The three "out count" statements come back as elements whose only
    # tags are total/nodes/ways/relations — everything else (from the
    # landuse "out tags" statement) is a real way/relation with a
    # "landuse" tag on it.
    counts = [el for el in elements if _is_count_element(el)]
    landuse_elements = [el for el in elements if not _is_count_element(el)]

    road_count = int(counts[0]["tags"]["total"]) if len(counts) > 0 else 0
    power_count = int(counts[1]["tags"]["total"]) if len(counts) > 1 else 0
    water_count = int(counts[2]["tags"]["total"]) if len(counts) > 2 else 0

    land_use = sorted(
        {
            el["tags"]["landuse"]
            for el in landuse_elements
            if "landuse" in el.get("tags", {})
        }
    )

    return {
        "nearbyRoads": road_count > 0,
        "roadCount": road_count,
        "nearbyPowerInfrastructure": power_count > 0,
        "powerInfrastructureCount": power_count,
        "nearbyWaterBodies": water_count > 0,
        "waterBodyCount": water_count,
        "landUse": land_use,
    }


async def _query_overpass(url: str, query: str) -> dict:
    """Sends one Overpass request with the required headers. Raises on
    any HTTP/network/parsing problem — caller decides how to handle it."""
    headers = {
        "User-Agent": settings.OVERPASS_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=settings.OSM_TIMEOUT) as client:
        response = await client.post(url, data={"data": query}, headers=headers)
        response.raise_for_status()
        return response.json()


async def fetch_osm_gis_data(
    latitude: float, longitude: float
) -> tuple[Optional[dict], str, Optional[str]]:
    """
    Returns (data, status, error_message).

    status is one of: "success", "error"
    data, when present, matches the GisData schema shape.
    """
    query = _build_overpass_query(latitude, longitude, settings.OSM_SEARCH_RADIUS_METERS)

    endpoints_to_try = [settings.OVERPASS_BASE_URL] + [
        url for url in settings.OVERPASS_FALLBACK_URLS if url != settings.OVERPASS_BASE_URL
    ]

    last_error: Optional[str] = None

    for url in endpoints_to_try:
        try:
            payload = await _query_overpass(url, query)
            return _parse_overpass_response(payload), "success", None

        except httpx.TimeoutException:
            last_error = "OpenStreetMap/Overpass request timed out."
        except httpx.HTTPStatusError as exc:
            last_error = f"Overpass API returned HTTP {exc.response.status_code}."
        except (KeyError, ValueError, TypeError, IndexError):
            last_error = "Overpass API returned an unexpected response format."
        except httpx.RequestError as exc:
            last_error = f"Overpass request failed: {exc}"

        # Try the next endpoint in the list, if any remain.

    return None, "error", last_error
