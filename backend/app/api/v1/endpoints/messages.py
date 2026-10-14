from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, get_hospital_context, require_hospital_operator
from app.core.database import get_db
from app.models import Conversation, Message, User, BloodRequest, DonorResponse, HospitalProfile, Notification

router = APIRouter(prefix="/messages", tags=["Private messages"])

class StartConversation(BaseModel):
    request_id: str
    donor_user_id: str | None = None

class SendMessage(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def trim(cls, value):
        if not value.strip(): raise ValueError("Message cannot be blank")
        return value.strip()

async def _hospital(db, user):
    if user.role == "hospital": return await require_hospital_operator(await get_hospital_context(db, user))
    if user.role != "donor": raise HTTPException(403, "Donor or authorized hospital access only")
    return None

async def _owned(db, conversation_id, user):
    context = await _hospital(db, user)
    item = await db.get(Conversation, conversation_id)
    if not item or (item.hospital_profile_id != context.hospital.id if context else item.donor_user_id != user.id):
        raise HTTPException(404, "Conversation not found")
    # Suspension revokes the hospital channel for both parties.
    hospital = await db.get(HospitalProfile, item.hospital_profile_id)
    if hospital.verification_status != "verified": raise HTTPException(403, "Hospital communication is unavailable until verification is approved")
    return item, context

@router.get("")
async def list_conversations(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await _hospital(db, user)
    condition = Conversation.hospital_profile_id == context.hospital.id if context else Conversation.donor_user_id == user.id
    rows = (await db.execute(select(Conversation, HospitalProfile, User).join(HospitalProfile, HospitalProfile.id == Conversation.hospital_profile_id).join(User, User.id == Conversation.donor_user_id).where(condition).order_by(Conversation.created_at.desc()))).all()
    items = []
    for conversation, hospital, donor in rows:
        last = (await db.execute(select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at.desc(), Message.id.desc()).limit(1))).scalar_one_or_none()
        read_at = conversation.hospital_read_at if context else conversation.donor_read_at
        filters = [Message.conversation_id == conversation.id, Message.sender_user_id != user.id]
        if context: filters.append(Message.sender_user_id == conversation.donor_user_id)
        if read_at: filters.append(Message.created_at > read_at)
        unread = int((await db.execute(select(func.count(Message.id)).where(*filters))).scalar_one())
        name = (donor.full_name or "Donor").split()[0] if context else hospital.hospital_name
        items.append({"id": conversation.id, "name": name, "request_id": conversation.blood_request_id, "last_message": last.body if last else "Start a conversation", "updated_at": last.created_at if last else conversation.created_at, "unread_count": unread})
    return {"items": items, "unread_count": sum(row["unread_count"] for row in items)}

@router.post("/conversations", status_code=201)
async def start_conversation(payload: StartConversation, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await _hospital(db, user)
    request = (await db.execute(select(BloodRequest).where(BloodRequest.id == payload.request_id).with_for_update())).scalar_one_or_none()
    if not request or (context and request.hospital_profile_id != context.hospital.id): raise HTTPException(404, "Request not found")
    donor_id = payload.donor_user_id if context else user.id
    response = (await db.execute(select(DonorResponse).where(DonorResponse.blood_request_id == request.id, DonorResponse.donor_user_id == donor_id, DonorResponse.status.in_(["invited", "pending", "accepted", "scheduled", "completed"])))).scalar_one_or_none()
    if not response: raise HTTPException(403, "A request invitation or donor response is required to open a conversation")
    hospital = await db.get(HospitalProfile, request.hospital_profile_id)
    if not hospital or hospital.verification_status != "verified": raise HTTPException(403, "Hospital verification required")
    item = (await db.execute(select(Conversation).where(Conversation.blood_request_id == request.id, Conversation.donor_user_id == donor_id))).scalar_one_or_none()
    if not item:
        item = Conversation(donor_user_id=donor_id, hospital_profile_id=hospital.id, blood_request_id=request.id)
        db.add(item)
    await db.commit()
    return {"id": item.id}

@router.get("/conversations/{conversation_id}")
async def read_conversation(conversation_id: str, before: str | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item, context = await _owned(db, conversation_id, user)
    read_time = datetime.now(timezone.utc)
    filters = [Message.conversation_id == item.id]
    if before:
        anchor = await db.get(Message, before)
        if not anchor or anchor.conversation_id != item.id: raise HTTPException(404, "Message not found")
        filters.append(or_(Message.created_at < anchor.created_at, and_(Message.created_at == anchor.created_at, Message.id < anchor.id)))
    rows = list((await db.execute(select(Message).where(*filters).order_by(Message.created_at.desc(), Message.id.desc()).limit(100))).scalars().all())
    rows.reverse()
    if context: item.hospital_read_at = read_time
    else: item.donor_read_at = read_time
    await db.commit()
    return {"items": [{"id": row.id, "body": row.body, "created_at": row.created_at, "mine": row.sender_user_id == user.id} for row in rows]}

@router.post("/conversations/{conversation_id}", status_code=201)
async def send_message(conversation_id: str, payload: SendMessage, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item, context = await _owned(db, conversation_id, user)
    message = Message(conversation_id=item.id, sender_user_id=user.id, body=payload.body)
    db.add(message)
    hospital = await db.get(HospitalProfile, item.hospital_profile_id)
    recipient = item.donor_user_id if context else hospital.user_id
    db.add(Notification(user_id=recipient, type="message", title="New private message", message="You have a new coordination message.", level="info", related_path="/donor/messages" if context else "/hospital/messages"))
    await db.commit()
    return {"id": message.id, "body": message.body, "created_at": message.created_at, "mine": True}
