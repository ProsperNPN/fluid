from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_superuser
from app.core.database import get_db
from app.models import AuditLog, HospitalProfile, User

router = APIRouter(prefix="/admin", tags=["Super Admin"])


@router.get("/hospitals")
async def list_hospitals(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: AsyncSession = Depends(get_db), _: User = Depends(require_superuser)):
    total = int((await db.execute(select(func.count(HospitalProfile.id)))).scalar_one())
    items = list((await db.execute(select(HospitalProfile).order_by(HospitalProfile.hospital_name).offset((page - 1) * page_size).limit(page_size))).scalars())
    return {"items": [{"id": v.id, "hospital_name": v.hospital_name, "registration_number": v.registration_number, "city": v.city, "country": v.country, "official_email": v.official_email, "verification_status": v.verification_status, "created_at": v.created_at} for v in items], "total": total}


@router.get("/users")
async def list_users(role: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: AsyncSession = Depends(get_db), _: User = Depends(require_superuser)):
    filters = [User.role == role] if role else []
    total = int((await db.execute(select(func.count(User.id)).where(*filters))).scalar_one())
    items = list((await db.execute(select(User).where(*filters).order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars())
    return {"items": [{"id": v.id, "full_name": v.full_name, "email": v.email, "role": v.role, "is_active": v.is_active, "is_superuser": v.is_superuser, "created_at": v.created_at} for v in items], "total": total}


@router.get("/audit-logs")
async def list_audit_logs(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db), _: User = Depends(require_superuser)):
    total = int((await db.execute(select(func.count(AuditLog.id)))).scalar_one())
    items = list((await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars())
    return {"items": [{"id": v.id, "actor_user_id": v.actor_user_id, "action": v.action, "entity_type": v.entity_type, "entity_id": v.entity_id, "details": v.details, "created_at": v.created_at} for v in items], "total": total}
