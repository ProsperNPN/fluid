from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import HospitalContext, require_hospital_admin
from app.core.database import get_db
from app.models import AuditLog, BloodRequest, HospitalMembership, Notification, User
from app.schemas.staff import StaffInvite, StaffPageRead, StaffRead, StaffRoleUpdate

router = APIRouter(prefix="/hospital-staff", tags=["Hospital Staff"])

def _read(member: HospitalMembership, user: User) -> StaffRead:
    return StaffRead(id=member.id, user_id=user.id, full_name=user.full_name, email=user.email, role=member.role, is_active=member.is_active, last_login_at=member.last_login_at, created_at=member.created_at)

@router.get("", response_model=StaffPageRead)
async def list_staff(db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_admin)) -> StaffPageRead:
    rows = (await db.execute(select(HospitalMembership, User).join(User, User.id == HospitalMembership.user_id).where(HospitalMembership.hospital_profile_id == context.hospital.id).order_by(HospitalMembership.created_at))).all()
    return StaffPageRead(items=[_read(*row) for row in rows], total=len(rows))

@router.post("/invite", response_model=StaffRead, status_code=201)
async def invite_staff(payload: StaffInvite, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_admin)) -> StaffRead:
    user = (await db.execute(select(User).where(func.lower(User.email) == payload.email.lower()))).scalar_one_or_none()
    if not user: raise HTTPException(status_code=404, detail="The staff member must create a FLUID hospital account before being invited")
    existing = (await db.execute(select(HospitalMembership).where(HospitalMembership.user_id == user.id, HospitalMembership.is_active.is_(True)))).scalar_one_or_none()
    if existing and existing.hospital_profile_id == context.hospital.id: raise HTTPException(status_code=409, detail="User already belongs to this hospital")
    if existing:
        request_count = int((await db.execute(select(func.count(BloodRequest.id)).where(BloodRequest.hospital_profile_id == existing.hospital_profile_id))).scalar_one() or 0)
        member_count = int((await db.execute(select(func.count(HospitalMembership.id)).where(HospitalMembership.hospital_profile_id == existing.hospital_profile_id, HospitalMembership.is_active.is_(True)))).scalar_one() or 0)
        if request_count or member_count > 1: raise HTTPException(status_code=409, detail="User already belongs to another active hospital")
        existing.hospital_profile_id = context.hospital.id; existing.role = payload.role; member = existing
    else:
        member = HospitalMembership(hospital_profile_id=context.hospital.id, user_id=user.id, role=payload.role); db.add(member)
    await db.flush()
    db.add(Notification(user_id=user.id, type="staff_invitation", title="Hospital staff invitation", message=f"You were added to {context.hospital.hospital_name} as {payload.role.replace('_', ' ')}.", level="success", related_path="/hospital"))
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="staff.invited", entity_type="hospital_membership", entity_id=member.id, details={"role": payload.role}))
    await db.commit(); await db.refresh(member); return _read(member, user)

async def _member_or_404(db: AsyncSession, hospital_id: str, member_id: str) -> HospitalMembership:
    member = await db.get(HospitalMembership, member_id)
    if not member or member.hospital_profile_id != hospital_id: raise HTTPException(status_code=404, detail="Staff member not found")
    return member

@router.patch("/{member_id}/role", response_model=StaffRead)
async def update_staff_role(member_id: str, payload: StaffRoleUpdate, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_admin)) -> StaffRead:
    member = await _member_or_404(db, context.hospital.id, member_id)
    if member.user_id == context.user.id: raise HTTPException(status_code=409, detail="You cannot change your own role")
    member.role = payload.role; user = await db.get(User, member.user_id)
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="staff.role_updated", entity_type="hospital_membership", entity_id=member.id, details={"role": payload.role}))
    await db.commit(); return _read(member, user)

@router.patch("/{member_id}/deactivate", response_model=StaffRead)
async def deactivate_staff(member_id: str, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_admin)) -> StaffRead:
    member = await _member_or_404(db, context.hospital.id, member_id)
    if member.user_id == context.user.id: raise HTTPException(status_code=409, detail="You cannot deactivate yourself")
    if member.role == "hospital_admin":
        count = int((await db.execute(select(func.count(HospitalMembership.id)).where(HospitalMembership.hospital_profile_id == context.hospital.id, HospitalMembership.role == "hospital_admin", HospitalMembership.is_active.is_(True)))).scalar_one() or 0)
        if count <= 1: raise HTTPException(status_code=409, detail="The last active Hospital Admin cannot be removed")
    member.is_active = False; user = await db.get(User, member.user_id)
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="staff.deactivated", entity_type="hospital_membership", entity_id=member.id))
    await db.commit(); return _read(member, user)
