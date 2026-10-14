from pydantic import BaseModel, Field

class InventorySettings(BaseModel):
    minimum_threshold: int = Field(ge=0, le=1000)
