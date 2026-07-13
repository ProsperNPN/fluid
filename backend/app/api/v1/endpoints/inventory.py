from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import HospitalContext, require_hospital_operator
from app.core.database import get_db
from app.models import AuditLog, BloodInventory, Notification
from app.schemas.inventory import InventoryAdjust, InventoryCreate, InventoryPageRead, InventoryRead

router = APIRouter(prefix="/inventory", tags=["Blood Inventory"])

def _read(item: BloodInventory) -> InventoryRead:
    available = item.units_available - item.units_reserved
    if item.expiration_date and item.expiration_date < date.today(): level = "expired"
    elif item.expiration_date and item.expiration_date <= date.today() + timedelta(days=7): level = "expiring_soon"
    elif available <= 0: level = "critical"
    elif available <= item.minimum_threshold: level = "low"
    else: level = "normal"
    return InventoryRead(id=item.id, blood_type=item.blood_type, component=item.component, units_available=item.units_available, units_reserved=item.units_reserved, expiration_date=item.expiration_date, storage_location=item.storage_location, minimum_threshold=item.minimum_threshold, alert_level=level, updated_at=item.updated_at)

@router.get("", response_model=InventoryPageRead)
async def list_inventory(blood_type: str | None = None, alert_only: bool = False, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)) -> InventoryPageRead:
    filters = [BloodInventory.hospital_profile_id == context.hospital.id]
    if blood_type: filters.append(BloodInventory.blood_type == blood_type)
    rows = list((await db.execute(select(BloodInventory).where(*filters).order_by(BloodInventory.expiration_date.asc().nullslast(), BloodInventory.blood_type))).scalars().all())
    items = [_read(item) for item in rows]
    if alert_only: items = [item for item in items if item.alert_level != "normal"]
    return InventoryPageRead(items=items, total=len(items))

@router.post("", response_model=InventoryRead, status_code=status.HTTP_201_CREATED)
async def create_inventory(payload: InventoryCreate, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)) -> InventoryRead:
    if not context.hospital.has_blood_bank: raise HTTPException(status_code=409, detail="Enable blood bank availability in the hospital profile first")
    item = BloodInventory(hospital_profile_id=context.hospital.id, **payload.model_dump()); db.add(item); await db.flush()
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="inventory.created", entity_type="blood_inventory", entity_id=item.id, details={"units": item.units_available}))
    await db.commit(); await db.refresh(item); return _read(item)

@router.post("/{item_id}/adjust", response_model=InventoryRead)
async def adjust_inventory(item_id: str, payload: InventoryAdjust, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)) -> InventoryRead:
    item = await db.get(BloodInventory, item_id)
    if not item or item.hospital_profile_id != context.hospital.id: raise HTTPException(status_code=404, detail="Inventory item not found")
    if payload.action in {"add", "donation_intake"}: item.units_available += payload.units
    elif payload.action in {"remove", "use", "expire"}:
        if item.units_available - payload.units < item.units_reserved: raise HTTPException(status_code=409, detail="Insufficient unreserved stock")
        item.units_available -= payload.units
    elif payload.action == "reserve":
        if item.units_reserved + payload.units > item.units_available: raise HTTPException(status_code=409, detail="Insufficient available stock")
        item.units_reserved += payload.units
    elif payload.action == "release":
        if payload.units > item.units_reserved: raise HTTPException(status_code=409, detail="Cannot release more units than reserved")
        item.units_reserved -= payload.units
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action=f"inventory.{payload.action}", entity_type="blood_inventory", entity_id=item.id, details={"units": payload.units, "reason": payload.reason}))
    available = item.units_available - item.units_reserved
    if available <= item.minimum_threshold: db.add(Notification(user_id=context.hospital.user_id, type="inventory_low", title=f"Low {item.blood_type} inventory", message=f"Only {available} available {item.component} unit(s) remain.", level="warning", related_path="/hospital/inventory"))
    await db.commit(); await db.refresh(item); return _read(item)
