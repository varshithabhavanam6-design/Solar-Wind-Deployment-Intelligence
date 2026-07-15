"""
Configuration loader for the Solar & Wind backend.

All values come from environment variables (loaded from a .env file via
python-dotenv). Nothing here is hardcoded — see .env.example for the
variables you need to set locally.
"""

from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Comma-separated list of origins allowed to call this API.
    # Defaults to the Vite dev server if not set.
    FRONTEND_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    ]

    # Timeouts (seconds) for outbound calls to external data sources.
    NASA_POWER_TIMEOUT: float = float(os.getenv("NASA_POWER_TIMEOUT", "12"))
    ELEVATION_TIMEOUT: float = float(os.getenv("ELEVATION_TIMEOUT", "10"))
    OSM_TIMEOUT: float = float(os.getenv("OSM_TIMEOUT", "15"))

    # Radius (meters) used for the OpenStreetMap/Overpass proximity queries.
    OSM_SEARCH_RADIUS_METERS: int = int(os.getenv("OSM_SEARCH_RADIUS_METERS", "3000"))

    # External endpoints — overridable via env in case a mirror/self-hosted
    # Overpass instance is preferred later.
    NASA_POWER_BASE_URL: str = os.getenv(
        "NASA_POWER_BASE_URL",
        "https://power.larc.nasa.gov/api/temporal/climatology/point",
    )
    ELEVATION_BASE_URL: str = os.getenv(
        "ELEVATION_BASE_URL", "https://api.open-elevation.com/api/v1/lookup"
    )
    OVERPASS_BASE_URL: str = os.getenv(
        "OVERPASS_BASE_URL", "https://overpass-api.de/api/interpreter"
    )

    # Fallback Overpass mirrors, tried in order if the primary instance
    # rejects or fails a request (e.g. HTTP 406/429/5xx). Comma-separated,
    # overridable via env.
    OVERPASS_FALLBACK_URLS: list[str] = [
        url.strip()
        for url in os.getenv(
            "OVERPASS_FALLBACK_URLS",
            "https://overpass.kumi.systems/api/interpreter,"
            "https://lz4.overpass-api.de/api/interpreter",
        ).split(",")
        if url.strip()
    ]

    # Overpass's public instances reject requests that don't identify the
    # calling application — a generic/missing User-Agent is a common cause
    # of HTTP 406 responses from overpass-api.de.
    OVERPASS_USER_AGENT: str = os.getenv(
        "OVERPASS_USER_AGENT",
        "SolarWindDeploymentIntelligence/1.0 (Milestone1; contact: varshithabhavanam6@gmail.com)",
    )


settings = Settings()
