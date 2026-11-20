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


# ── Customer Statement of Account (كشف حساب عميل) ─────────────────────────

class StatementSummary(BaseModel):
    opening_balance: Decimal
    total_debits: Decimal
    total_credits: Decimal
    net_period_change: Decimal
    closing_balance: Decimal
    credit_limit: Decimal
    available_credit: Decimal


class StatementAgingSummary(BaseModel):
    current_30_days: Decimal
    days_31_to_60: Decimal
    days_61_to_90: Decimal
    over_90_days: Decimal
    total_outstanding: Decimal


class StatementEntry(BaseModel):
    id: str
    date: datetime
    type: str  # "INVOICE", "POS_SALE", "PAYMENT", "OPENING_BALANCE"
    reference: str
    description: str
    status: Optional[str] = None
    due_date: Optional[datetime] = None
    debit: Optional[Decimal] = None
    credit: Optional[Decimal] = None
    running_balance: Decimal


class CustomerStatementResponse(BaseModel):
    customer: CustomerResponse
    pharmacy_profile: Optional[dict] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    statement_date: datetime
    summary: StatementSummary
    aging: StatementAgingSummary
    entries: List[StatementEntry]


# ── Notes ─────────────────────────────────────────────────────────────────

class NotesUpdate(BaseModel):
    notes: str
