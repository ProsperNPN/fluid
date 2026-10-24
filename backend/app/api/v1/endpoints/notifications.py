from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import Query, Request, APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Notification, User
from app.schemas.notification import NotificationPageRead, NotificationRead

router = APIRouter(prefix="/notifications", tags=["Notifications"])
_connections: dict[str, int] = {}

@router.get("/state")
async def state(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.services.notification_stream import notification_state
    return await notification_state(db, current_user.id)


@router.get("/stream")
async def stream(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from fastapi.responses import StreamingResponse
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.services.notification_stream import event_stream
    from app.core.security import decode_token
    import time
    token = request.headers.get("authorization", "").split()[-1]
    payload = decode_token(token, expected_type="access")
    lifetime = max(0, min(90, float(payload.exp) - time.time()))
    user_id = current_user.id
    if _connections.get(user_id, 0) >= 5:
        raise HTTPException(429, "Too many live notification connections")
    factory = async_sessionmaker(db.bind, expire_on_commit=False)
    await db.close()
    async def limited_stream():
        _connections[user_id] = _connections.get(user_id, 0) + 1
        try:
            async for event in event_stream(factory, user_id, request, lifetime, payload.sid):
                yield event
        finally:
            remaining = _connections.get(user_id, 1) - 1
            if remaining:
                _connections[user_id] = remaining
            else:
                _connections.pop(user_id, None)
    return StreamingResponse(limited_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


class ReceivedNotifications(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=100)


@router.post("/received", status_code=204)
async def received(payload: ReceivedNotifications, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Ignore foreign/missing IDs without providing an ownership oracle.
    await db.execute(update(Notification).where(Notification.user_id == current_user.id,
        Notification.id.in_(payload.ids), Notification.received_at.is_(None))
        .values(received_at=datetime.now(timezone.utc), updated_at=Notification.updated_at))
    await db.commit()
    return Response(status_code=204)


@router.patch("/{notification_id}/unread", response_model=NotificationRead)
async def mark_unread(notification_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = await db.get(Notification, notification_id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(404, "Notification not found")
    item.read_at = None
    item.is_read = False
    await db.commit()
    return NotificationRead.model_validate(item)


@router.get("", response_model=NotificationPageRead)
async def list_notifications(unread_only: bool = False, page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=100), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> NotificationPageRead:
    from app.services.request_lifecycle import expire_requests
    await expire_requests(db)
    filters = [Notification.user_id == current_user.id]
    if unread_only: filters.append(Notification.is_read.is_(False))
    total = (await db.execute(select(func.count(Notification.id)).where(*filters))).scalar_one()
    items = list((await db.execute(select(Notification).where(*filters).order_by(Notification.created_at.desc(), Notification.id.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all())
    unread = int((await db.execute(select(func.count(Notification.id)).where(Notification.user_id == current_user.id, Notification.is_read.is_(False)))).scalar_one() or 0)
    for item in items:
        if item.payload and item.payload.get("request_id"):
            from app.models import BloodRequest, DonorResponse, DonorProfile, HospitalProfile
            from app.services.blood_matching import match_request
            blood_request = await db.get(BloodRequest, item.payload["request_id"])
            profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == current_user.id))).scalar_one_or_none()
            response = (await db.execute(select(DonorResponse).where(DonorResponse.blood_request_id == item.payload["request_id"], DonorResponse.donor_user_id == current_user.id))).scalar_one_or_none()
            hospital = await db.get(HospitalProfile, blood_request.hospital_profile_id) if blood_request else None
            can_respond = bool(profile and blood_request and hospital and hospital.verification_status == "verified" and ((response and response.status == "invited") or (response is None and blood_request.urgency == "routine")) and match_request(profile, blood_request)[0])
            # Response-only projection: never write dynamic status back to persistent history.
            from sqlalchemy.orm.attributes import set_committed_value
            set_committed_value(item, "payload", {**item.payload, "status": blood_request.status if blood_request else "unavailable", "response_status": response.status if response else None, "can_respond": can_respond})
    return NotificationPageRead(items=[NotificationRead.model_validate(item) for item in items], unread_count=unread, total=total, page=page, total_pages=(total + page_size - 1) // page_size)

@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(notification_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> NotificationRead:
    item = await db.get(Notification, notification_id)
    if not item or item.user_id != current_user.id: raise HTTPException(status_code=404, detail="Notification not found")
    item.read_at = datetime.now(timezone.utc)
    item.is_read = True; await db.commit(); await db.refresh(item); return NotificationRead.model_validate(item)

@router.patch("/read-all", status_code=204)
async def mark_all_read(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    await db.execute(update(Notification).where(Notification.user_id == current_user.id).values(is_read=True, read_at=datetime.now(timezone.utc))); await db.commit(); return Response(status_code=204)

@router.delete("/{notification_id}", status_code=204)
async def delete_notification(notification_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    result = await db.execute(delete(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id))
    if not result.rowcount: raise HTTPException(status_code=404, detail="Notification not found")
    await db.commit(); return Response(status_code=204)
