from time import perf_counter

from fastapi import Request
from starlette.responses import Response

from app.core.config import settings


async def hardening_middleware(request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
    auth_header = request.headers.get("authorization", "")
    if auth_header and len(auth_header) > settings.MAX_AUTH_HEADER_LENGTH:
        return Response(status_code=400, content="Invalid authorization header")

    start = perf_counter()
    response = await call_next(request)
    duration_ms = (perf_counter() - start) * 1000

    if settings.SECURITY_HEADERS_ENABLED:
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    if request.url.path.startswith(f"{settings.API_V1_STR}/auth"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"

    response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
    return response
