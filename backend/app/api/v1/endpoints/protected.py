from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, require_superuser
from app.models import User
from app.schemas import MessageResponse, UserRead

router = APIRouter(prefix="/protected", tags=["Protected"])


@router.get("/profile", response_model=UserRead)
async def read_profile(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.get("/admin/audit", response_model=MessageResponse)
async def admin_audit(_: User = Depends(require_superuser)) -> MessageResponse:
    return MessageResponse(message="Admin-only resource access granted")
