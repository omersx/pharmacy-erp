from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, date
from typing import List, Dict, Any, Optional

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.sales.models import Sale, SaleItem
from app.modules.medicines.models import MedicineBatch, Medicine
from app.modules.customers.models import Customer

router = APIRouter(tags=["reports"])

@router.get("/sales/daily")
async def daily_sales(date: date, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(
        func.count(Sale.id).label("total_sales"),
        func.sum(Sale.total_amount).label("total_amount")
    ).where(
        func.date(Sale.created_at) == date,
        Sale.status == "COMPLETED"
    )
    result = await db.execute(query)
    row = result.first()
    
    total_count = row.total_sales or 0
    total_amount = row.total_amount or 0
    avg_sale = total_amount / total_count if total_count > 0 else 0
    
    return {
        "date": date,
        "total_sales_count": total_count,
        "total_amount": total_amount,
        "average_sale": avg_sale
    }

@router.get("/sales/monthly")
async def monthly_sales(year: int, month: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(
        func.count(Sale.id).label("total_sales"),
        func.sum(Sale.total_amount).label("total_amount")
    ).where(
        func.extract('year', Sale.created_at) == year,
        func.extract('month', Sale.created_at) == month,
        Sale.status == "COMPLETED"
    )
    result = await db.execute(query)
    row = result.first()
    
    return {
        "year": year,
        "month": month,
        "total_sales_count": row.total_sales or 0,
        "total_amount": row.total_amount or 0
    }

@router.get("/inventory/stock-value")
async def stock_value(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(
        func.sum(MedicineBatch.quantity_remaining * MedicineBatch.purchase_price).label("total_value")
    )
    result = await db.execute(query)
    value = result.scalar() or 0
    
    return {
        "total_stock_value": value
    }

@router.get("/sales/top-products")
async def top_products(limit: int = 10, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(
        Medicine.name_en,
        Medicine.name_ar,
        func.sum(SaleItem.quantity).label("total_quantity"),
        func.sum(SaleItem.line_total).label("total_revenue")
    ).join(SaleItem, SaleItem.medicine_id == Medicine.id)\
     .join(Sale, Sale.id == SaleItem.sale_id)\
     .where(Sale.status == "COMPLETED")\
     .group_by(Medicine.id)\
     .order_by(desc("total_quantity"))\
     .limit(limit)
     
    result = await db.execute(query)
    return [
        {
            "name_en": row.name_en,
            "name_ar": row.name_ar,
            "total_quantity": row.total_quantity,
            "total_revenue": row.total_revenue
        }
        for row in result.all()
    ]

@router.get("/financial/profit")
async def financial_profit(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cogs_query = select(
        func.sum(SaleItem.quantity * MedicineBatch.purchase_price).label("cogs")
    ).join(Sale, Sale.id == SaleItem.sale_id).join(MedicineBatch, MedicineBatch.id == SaleItem.batch_id).where(Sale.status == "COMPLETED")
    
    if start_date:
        cogs_query = cogs_query.where(func.date(Sale.created_at) >= start_date)
    if end_date:
        cogs_query = cogs_query.where(func.date(Sale.created_at) <= end_date)
        
    cogs_result = await db.execute(cogs_query)
    cogs_row = cogs_result.first()
    cogs = float(cogs_row.cogs or 0)
    
    revenue_query = select(func.sum(Sale.total_amount).label("revenue")).where(Sale.status == "COMPLETED")
    if start_date:
        revenue_query = revenue_query.where(func.date(Sale.created_at) >= start_date)
    if end_date:
        revenue_query = revenue_query.where(func.date(Sale.created_at) <= end_date)
        
    rev_result = await db.execute(revenue_query)
    rev_row = rev_result.first()
    revenue = float(rev_row.revenue or 0)
    
    return {
        "revenue": revenue,
        "cogs": cogs,
        "profit": revenue - cogs
    }

@router.get("/customers/balances")
async def customer_balances(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(
        Customer.id,
        Customer.name,
        Customer.phone,
        Customer.credit_limit,
        Customer.credit_balance
    ).where(
        Customer.credit_balance > 0
    ).order_by(desc(Customer.credit_balance))
    
    result = await db.execute(query)
    
    return [
        {
            "id": row.id,
            "name": row.name,
            "phone": row.phone,
            "credit_limit": float(row.credit_limit or 0),
            "credit_balance": float(row.credit_balance or 0)
        }
        for row in result.all()
    ]

@router.get("/inventory/expiry-summary")
async def expiry_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(MedicineBatch.expiry_date).where(MedicineBatch.quantity_remaining > 0)
    result = await db.execute(query)
    batches = result.scalars().all()
    
    today = date.today()
    summary = {
        "expired": 0,
        "expiring_30_days": 0,
        "expiring_60_days": 0,
        "expiring_90_days": 0,
        "safe": 0
    }
    
    for exp in batches:
        if exp is None:
            summary["safe"] += 1
            continue
            
        # Parse from string if SQLite returned a string instead of date object
        if isinstance(exp, str):
            try:
                exp = datetime.strptime(exp, "%Y-%m-%d").date()
            except ValueError:
                summary["safe"] += 1
                continue
                
        days = (exp - today).days
        if days < 0:
            summary["expired"] += 1
        elif days <= 30:
            summary["expiring_30_days"] += 1
        elif days <= 60:
            summary["expiring_60_days"] += 1
        elif days <= 90:
            summary["expiring_90_days"] += 1
        else:
            summary["safe"] += 1
            
    return summary

@router.get("/sales/range")
async def sales_range(
    start_date: date,
    end_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(
        func.count(Sale.id).label("total_sales"),
        func.sum(Sale.total_amount).label("total_revenue"),
        func.sum(Sale.discount_amount).label("total_discount")
    ).where(
        Sale.status == "COMPLETED",
        func.date(Sale.created_at) >= start_date,
        func.date(Sale.created_at) <= end_date
    )
    result = await db.execute(query)
    row = result.first()
    
    # Get daily breakdown
    daily_query = select(
        func.date(Sale.created_at).label("date"),
        func.sum(Sale.total_amount).label("revenue")
    ).where(
        Sale.status == "COMPLETED",
        func.date(Sale.created_at) >= start_date,
        func.date(Sale.created_at) <= end_date
    ).group_by(func.date(Sale.created_at)).order_by(func.date(Sale.created_at))
    
    daily_result = await db.execute(daily_query)
    daily_breakdown = [
        {"date": str(r.date), "revenue": float(r.revenue or 0)}
        for r in daily_result.all()
    ]
    
    return {
        "total_sales_count": row.total_sales or 0,
        "total_revenue": float(row.total_revenue or 0),
        "total_discount": float(row.total_discount or 0),
        "daily_breakdown": daily_breakdown
    }


# Known mobile money providers in Sudan
MOBILE_METHODS = {"bankak", "fawry", "amin"}

def _classify_method(method: str) -> str:
    """Classify a payment method as 'cash' or 'mobile'."""
    m = method.lower().strip()
    if m == "cash":
        return "cash"
    return "mobile"

def _label_method(method: str) -> str:
    """Convert stored method string to display label."""
    m = method.lower().strip()
    return m.capitalize()


@router.get("/financial/payment-breakdown")
async def payment_breakdown(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get revenue breakdown grouped by payment method."""
    query = select(
        Sale.payment_method,
        func.count(Sale.id).label("count"),
        func.sum(Sale.total_amount).label("amount")
    ).where(
        Sale.status == "COMPLETED"
    ).group_by(Sale.payment_method)

    if start_date:
        query = query.where(func.date(Sale.created_at) >= start_date)
    if end_date:
        query = query.where(func.date(Sale.created_at) <= end_date)

    result = await db.execute(query)
    rows = result.all()

    total_revenue = sum(float(r.amount or 0) for r in rows)

    methods = []
    for r in rows:
        method_name = (r.payment_method or "cash").lower().strip()
        amount = float(r.amount or 0)
        methods.append({
            "method": method_name,
            "label": _label_method(method_name),
            "type": _classify_method(method_name),
            "amount": amount,
            "count": r.count or 0,
            "percentage": round((amount / total_revenue * 100), 1) if total_revenue > 0 else 0
        })

    # Sort: cash first, then by amount descending
    methods.sort(key=lambda x: (0 if x["type"] == "cash" else 1, -x["amount"]))

    return {
        "total_revenue": total_revenue,
        "methods": methods
    }


@router.get("/medicines/movement")
async def medicine_movement(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Base query for sales within period
    sales_query = select(
        Medicine.id,
        Medicine.name_en,
        Medicine.name_ar,
        func.sum(SaleItem.quantity).label("total_quantity"),
        func.sum(SaleItem.line_total).label("total_revenue")
    ).join(SaleItem, SaleItem.medicine_id == Medicine.id)\
     .join(Sale, Sale.id == SaleItem.sale_id)\
     .where(Sale.status == "COMPLETED")
     
    if start_date:
        sales_query = sales_query.where(func.date(Sale.created_at) >= start_date)
    if end_date:
        sales_query = sales_query.where(func.date(Sale.created_at) <= end_date)
        
    sales_query = sales_query.group_by(Medicine.id)
    
    # 2. Fast Moving (Top N by quantity)
    fast_query = sales_query.order_by(desc("total_quantity")).limit(limit)
    fast_result = await db.execute(fast_query)
    fast_moving = [
        {
            "id": str(r.id),
            "name_en": r.name_en,
            "name_ar": r.name_ar,
            "quantity": float(r.total_quantity or 0),
            "revenue": float(r.total_revenue or 0)
        } for r in fast_result.all()
    ]
    
    # 3. Slow Moving (Bottom N by quantity, but > 0)
    slow_query = sales_query.order_by("total_quantity").limit(limit)
    slow_result = await db.execute(slow_query)
    slow_moving = [
        {
            "id": str(r.id),
            "name_en": r.name_en,
            "name_ar": r.name_ar,
            "quantity": float(r.total_quantity or 0),
            "revenue": float(r.total_revenue or 0)
        } for r in slow_result.all()
    ]
    
    # 4. Dead Stock (Stock > 0 but NO sales in this period)
    # First, get IDs of medicines sold in this period
    sold_query = select(SaleItem.medicine_id).join(Sale, Sale.id == SaleItem.sale_id).where(Sale.status == "COMPLETED")
    if start_date:
        sold_query = sold_query.where(func.date(Sale.created_at) >= start_date)
    if end_date:
        sold_query = sold_query.where(func.date(Sale.created_at) <= end_date)
        
    sold_result = await db.execute(sold_query.distinct())
    sold_ids = [r for r in sold_result.scalars().all()]
    
    # Then query medicines with stock > 0 not in sold_ids
    # Get stock per medicine by aggregating batches
    stock_subq = select(
        MedicineBatch.medicine_id,
        func.sum(MedicineBatch.quantity_remaining).label("total_stock")
    ).group_by(MedicineBatch.medicine_id).subquery()
    
    dead_query = select(
        Medicine.id,
        Medicine.name_en,
        Medicine.name_ar,
        stock_subq.c.total_stock
    ).join(stock_subq, stock_subq.c.medicine_id == Medicine.id)\
     .where(stock_subq.c.total_stock > 0)
     
    if sold_ids:
        dead_query = dead_query.where(Medicine.id.notin_(sold_ids))
        
    dead_query = dead_query.order_by(desc(stock_subq.c.total_stock)).limit(limit * 2)
    dead_result = await db.execute(dead_query)
    
    dead_stock = [
        {
            "id": str(r.id),
            "name_en": r.name_en,
            "name_ar": r.name_ar,
            "stock": float(r.total_stock or 0)
        } for r in dead_result.all()
    ]
    
    return {
        "fast_moving": fast_moving,
        "slow_moving": slow_moving,
        "dead_stock": dead_stock
    }