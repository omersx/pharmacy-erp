from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal
import uuid
from datetime import datetime
from typing import List, Optional

class InvoiceItemBase(BaseModel):
    label: str
    medicine_id: Optional[uuid.UUID] = None
    batch_id: Optional[uuid.UUID] = None
    quantity: Decimal = Field(default=Decimal("1.0"), ge=0.01)
    unit_price: Decimal = Field(default=Decimal("0.0"), ge=0.0)
    discount_percent: Decimal = Field(default=Decimal("0.0"), ge=0.0, le=100.0)
    tax_percent: Decimal = Field(default=Decimal("0.0"), ge=0.0, le=100.0)

class InvoiceItemCreate(InvoiceItemBase):
    pass

class InvoiceItemResponse(InvoiceItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    invoice_id: uuid.UUID
    line_total: Decimal
    batch_number: Optional[str] = None

class InvoicePaymentCreate(BaseModel):
    payment_method: str = "CASH"  # CASH, BANKAK, FAWRY, CARD, BANK_TRANSFER
    amount: Decimal = Field(..., gt=0)
    payment_date: Optional[datetime] = None
    reference: Optional[str] = None
    notes: Optional[str] = None

class InvoicePaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    invoice_id: uuid.UUID
    payment_method: str
    display_name: Optional[str] = None
    amount: Decimal
    payment_date: datetime
    reference: Optional[str] = None
    notes: Optional[str] = None
    recorder_name: Optional[str] = None

class CustomerInvoiceCreate(BaseModel):
    customer_id: uuid.UUID
    invoice_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    payment_terms: Optional[str] = "Immediate Payment"
    currency: Optional[str] = "SDG"
    notes: Optional[str] = None
    items: List[InvoiceItemCreate] = []

class CustomerInvoiceUpdate(BaseModel):
    customer_id: Optional[uuid.UUID] = None
    invoice_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[InvoiceItemCreate]] = None

class CustomerInvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    invoice_number: Optional[str] = None  # None/Draft when in DRAFT state
    invoice_type: str = "OUT_INVOICE"
    source_type: str = "BACK_OFFICE"
    sale_id: Optional[uuid.UUID] = None

    customer_id: uuid.UUID
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_tax_id: Optional[str] = None
    customer_address: Optional[str] = None

    branch_id: uuid.UUID
    branch_name: Optional[str] = None
    cashier_id: uuid.UUID
    cashier_name: Optional[str] = None

    status: str  # DRAFT, POSTED, PAID, CANCELLED
    invoice_date: datetime
    due_date: datetime
    currency: str = "SDG"

    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    amount_due: Decimal

    payment_terms: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    items: List[InvoiceItemResponse] = []
    payments: List[InvoicePaymentResponse] = []

class PharmacyProfileBase(BaseModel):
    name_en: str = "Grand Nile Pharmacy"
    name_ar: Optional[str] = "صيدلية النيل الكبرى"
    logo_url: Optional[str] = None
    tax_number: Optional[str] = "300123456700003"
    cr_number: Optional[str] = "1010482910"
    phone: Optional[str] = "+249 91 234 5678"
    mobile: Optional[str] = None
    email: Optional[str] = "info@grandnile-pharma.com"
    address: Optional[str] = "Al-Siteen Street, Khartoum"
    city: Optional[str] = "Khartoum"
    currency: str = "SDG"
    bank_name: Optional[str] = "Bank of Khartoum (Bankak)"
    bank_account_number: Optional[str] = "1234567"
    bank_iban: Optional[str] = None
    invoice_terms: Optional[str] = "Medicines cannot be returned without original invoice within 3 days. / البضاعة المباعة لا ترد ولا تستبدل بعد 3 أيام إلا بالفاتورة الأصلية"
    invoice_prefix: str = "INV"

class PharmacyProfileCreateOrUpdate(PharmacyProfileBase):
    pass

class PharmacyProfileResponse(PharmacyProfileBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
