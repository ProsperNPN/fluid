from fastapi import APIRouter

from app.api.v1.endpoints.analytics import router as analytics_router
from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.appointments import router as appointments_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.blood_requests import router as blood_requests_router
from app.api.v1.endpoints.dashboard import router as dashboard_router
from app.api.v1.endpoints.donor_matches import router as donor_matches_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.messages import router as messages_router
from app.api.v1.endpoints.workspace import router as workspace_router
from app.api.v1.endpoints.notifications import router as notifications_router
from app.api.v1.endpoints.portal import router as portal_router
from app.api.v1.endpoints.profiles import router as profiles_router
from app.api.v1.endpoints.protected import router as protected_router
from app.api.v1.endpoints.users import router as users_router
from app.api.v1.endpoints.inventory import router as inventory_router
from app.api.v1.endpoints.staff import router as staff_router
from app.api.v1.endpoints.verifications import router as verifications_router

api_router = APIRouter()
api_router.include_router(messages_router)
api_router.include_router(workspace_router)
api_router.include_router(admin_router)
api_router.include_router(health_router)
api_router.include_router(analytics_router)
api_router.include_router(appointments_router)
api_router.include_router(auth_router)
api_router.include_router(blood_requests_router)
api_router.include_router(dashboard_router)
api_router.include_router(donor_matches_router)
api_router.include_router(notifications_router)
api_router.include_router(portal_router)
api_router.include_router(profiles_router)
api_router.include_router(users_router)
api_router.include_router(inventory_router)
api_router.include_router(staff_router)
api_router.include_router(verifications_router)
api_router.include_router(protected_router)
