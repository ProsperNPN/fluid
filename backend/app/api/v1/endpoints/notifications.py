from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Notification, User
from app.schemas.notification import NotificationPageRead, NotificationRead

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("", response_model=NotificationPageRead)
async def list_notifications(unread_only: bool = False, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> NotificationPageRead:
    filters = [Notification.user_id == current_user.id]
    if unread_only: filters.append(Notification.is_read.is_(False))
    items = list((await db.execute(select(Notification).where(*filters).order_by(Notification.created_at.desc()).limit(100))).scalars().all())
    unread = int((await db.execute(select(func.count(Notification.id)).where(Notification.user_id == current_user.id, Notification.is_read.is_(False)))).scalar_one() or 0)
    return NotificationPageRead(items=[NotificationRead.model_validate(item) for item in items], unread_count=unread)

@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(notification_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> NotificationRead:
    item = await db.get(Notification, notification_id)
    if not item or item.user_id != current_user.id: raise HTTPException(status_code=404, detail="Notification not found")
    item.is_read = True; await db.commit(); await db.refresh(item); return NotificationRead.model_validate(item)

@router.patch("/read-all", status_code=204)
async def mark_all_read(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    await db.execute(update(Notification).where(Notification.user_id == current_user.id).values(is_read=True)); await db.commit(); return Response(status_code=204)

@router.delete("/{notification_id}", status_code=204)
async def delete_notification(notification_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    result = await db.execute(delete(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id))
    if not result.rowcount: raise HTTPException(status_code=404, detail="Notification not found")
    await db.commit(); return Response(status_code=204)
