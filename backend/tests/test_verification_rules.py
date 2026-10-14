import pytest
from pydantic import ValidationError

from app.schemas.verification import VerificationDecision


def test_verification_decision_rejects_unknown_action():
    with pytest.raises(ValidationError):
        VerificationDecision(action="promote")


def test_verification_decision_limits_review_notes():
    with pytest.raises(ValidationError):
        VerificationDecision(action="rejected", notes="x" * 4001)


def test_verification_decision_accepts_supported_status():
    decision = VerificationDecision(action="verified", notes="Credentials confirmed")
    assert decision.action == "verified"
