from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from decimal import Decimal


class CustomerBase(BaseModel):
    name: str
    name_ar: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    credit_limit: Optional[Decimal] = Decimal("0")
    notes: Optional[str] = None


class CustomerCreate(CustomerBase):
    opening_balance: Optional[Decimal] = Decimal("0")


class CustomerUpdate(CustomerBase):
    name: Optional[str] = None


class CustomerResponse(CustomerBase):
    id: UUID
    credit_balance: Decimal
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Payments ──────────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str = "CASH"
    reference: Optional[str] = None
    notes: Optional[str] = None


class PaymentResponse(BaseModel):
    id: UUID
    customer_id: UUID
    amount: Decimal
    payment_method: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Credit Ledger ─────────────────────────────────────────────────────────

class CreditLedgerEntry(BaseModel):
    date: datetime
    type: str  # "SALE" or "PAYMENT"
    reference: str
    debit: Optional[Decimal] = None
    credit: Optional[Decimal] = None
    balance: Decimal


# ── Notes ─────────────────────────────────────────────────────────────────

class NotesUpdate(BaseModel):
    notes: str
