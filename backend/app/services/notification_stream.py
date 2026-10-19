"""Short database reads between SSE events; no idle database connections."""
import asyncio
import hashlib
import json
import time
from sqlalchemy import select
from app.models import Notification, User, Appointment, BloodRequest, HospitalMembership, InventoryUnit, InventoryStockPolicy, InventoryComponentPolicy


async def notification_state(db, user_id):
    rows = (await db.execute(select(Notification.id, Notification.is_read, Notification.updated_at)
        .where(Notification.user_id == user_id).order_by(Notification.id))).all()
    appointments = (await db.execute(select(Appointment.id, Appointment.version, Appointment.status).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).where(
        (Appointment.donor_user_id == user_id) | BloodRequest.hospital_profile_id.in_(select(HospitalMembership.hospital_profile_id).where(HospitalMembership.user_id == user_id, HospitalMembership.is_active.is_(True))))
        .order_by(Appointment.id))).all()
    facilities = select(HospitalMembership.hospital_profile_id).where(HospitalMembership.user_id == user_id, HospitalMembership.is_active.is_(True))
    inventory = (await db.execute(select(InventoryUnit.id,InventoryUnit.version).where(InventoryUnit.hospital_profile_id.in_(facilities)).order_by(InventoryUnit.id))).all()
    stock = (await db.execute(select(InventoryStockPolicy.id,InventoryStockPolicy.minimum,InventoryStockPolicy.critical).where(InventoryStockPolicy.hospital_profile_id.in_(facilities)).order_by(InventoryStockPolicy.id))).all()
    policies = (await db.execute(select(InventoryComponentPolicy.id,InventoryComponentPolicy.version).where(InventoryComponentPolicy.hospital_profile_id.in_(facilities)).order_by(InventoryComponentPolicy.id))).all()
    revision = hashlib.sha256(repr((rows, appointments, inventory, stock, policies)).encode()).hexdigest()
    return {"revision": revision, "unread_count": sum(not row.is_read for row in rows)}


async def event_stream(factory, user_id, request, lifetime=90):
    previous = None
    started = time.monotonic()
    while time.monotonic() - started < lifetime:
        if await request.is_disconnected():
            return
        async with factory() as db:
            user = await db.get(User, user_id)
            if not user or not user.is_active:
                return
            state = await notification_state(db, user_id)
        if state["revision"] != previous:
            previous = state["revision"]
            yield f'id: {previous}\nevent: sync\ndata: {json.dumps(state)}\n\n'
        else:
            yield ': heartbeat\n\n'
        await asyncio.sleep(2)
