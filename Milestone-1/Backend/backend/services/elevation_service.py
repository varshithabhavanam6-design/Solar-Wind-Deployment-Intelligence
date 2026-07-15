"""
Elevation / terrain integration.

Uses the free, keyless Open-Elevation API, which is backed by SRTM and other
public elevation datasets — satisfying the Milestone 1 "NASA SRTM elevation"
requirement without needing NASA Earthdata credentials.

Docs: https://www.open-elevation.com/
"""

from __future__ import annotations

import httpx
from typing import Optional

from ..config import settings


async def fetch_elevation_data(
    latitude: float, longitude: float
) -> tuple[Optional[dict], str, Optional[str]]:
    """
    Returns (data, status, error_message).

    status is one of: "success", "error"
    data, when present, has key: elevation (meters)
    """
    params = {"locations": f"{latitude},{longitude}"}

    try:
        async with httpx.AsyncClient(timeout=settings.ELEVATION_TIMEOUT) as client:
            response = await client.get(settings.ELEVATION_BASE_URL, params=params)
            response.raise_for_status()
            payload = response.json()

        results = payload.get("results", [])

        if not results:
            return None, "error", "Elevation service returned no results."

        elevation = results[0].get("elevation")

        if elevation is None:
            return None, "error", "Elevation value missing from response."

        return {"elevation": elevation}, "success", None

    except httpx.TimeoutException:
        return None, "error", "Elevation request timed out."
    except httpx.HTTPStatusError as exc:
        return None, "error", f"Elevation service returned HTTP {exc.response.status_code}."
    except (KeyError, ValueError, TypeError, IndexError):
        return None, "error", "Elevation service returned an unexpected response format."
    except httpx.RequestError as exc:
        return None, "error", f"Elevation request failed: {exc}"
