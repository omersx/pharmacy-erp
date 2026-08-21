import asyncio
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from app.core.database import AsyncSessionLocal, init_db
from sqlalchemy import select

from app.modules.auth.models import User
from app.modules.organizations.models import Branch
from app.modules.medicines.models import MedicineCategory, Medicine, MedicineBatch
from app.modules.suppliers.models import Supplier
from app.modules.customers.models import Customer
from app.modules.roles.models import Role, Permission
from app.core.security import hash_password

async def seed_roles_and_permissions(db):
    res = await db.execute(select(Role).limit(1))
    if res.scalars().first():
        print("Roles already seeded. Skipping.")
        return

    permissions_data = [
        ("dashboard", ["view"]),
        ("pos", ["view", "create_sale", "void_sale", "apply_discount", "hold_sale"]),
        ("sales", ["view", "create", "void", "return_sale", "export"]),
        ("inventory", ["view", "adjust", "transfer", "receive"]),
        ("catalog", ["view", "create", "edit", "delete"]),
        ("customers", ["view", "create", "edit", "delete"]),
        ("reports", ["view", "export"]),
        ("settings", ["view", "manage_users", "manage_roles", "manage_branches", "manage_system"]),
        ("purchases", ["view", "create", "approve", "receive"]),
    ]

    all_permissions = []
    perm_map = {}
    for module, actions in permissions_data:
        for action in actions:
            code = f"{module}.{action}"
            p = Permission(
                code=code,
                module=module,
                action=action,
                display_name=f"{action.replace('_', ' ').title()} {module.title()}"
            )
            all_permissions.append(p)
            perm_map[code] = p
            
    db.add_all(all_permissions)
    await db.commit()

    roles_data = [
        {
            "name": "SUPER_ADMIN", "display_name": "Super Admin",
            "sort_order": 0, "color": "red", "is_system": True,
            "permissions": list(perm_map.keys())
        },
        {
            "name": "OWNER", "display_name": "Owner",
            "sort_order": 1, "color": "purple", "is_system": True,
            "permissions": [k for k in perm_map.keys() if k != "settings.manage_system"]
        },
        {
            "name": "BRANCH_MANAGER", "display_name": "Branch Manager",
            "sort_order": 2, "color": "blue", "is_system": True,
            "permissions": ["dashboard.view"] +
                           [k for k in perm_map.keys() if k.startswith("pos.") or k.startswith("sales.") or k.startswith("inventory.") or k.startswith("customers.") or k.startswith("reports.")] +
                           ["catalog.view", "catalog.edit", "settings.view"]
        },
        {
            "name": "PHARMACIST", "display_name": "Pharmacist",
            "sort_order": 3, "color": "green", "is_system": True,
            "permissions": ["dashboard.view", "pos.view", "pos.create_sale", "pos.hold_sale", "sales.view", "inventory.view", "catalog.view", "customers.view"]
        },
        {
            "name": "CASHIER", "display_name": "Cashier",
            "sort_order": 4, "color": "amber", "is_system": True,
            "permissions": ["pos.view", "pos.create_sale", "pos.hold_sale", "pos.apply_discount", "sales.view", "customers.view", "customers.create"]
        },
        {
            "name": "INVENTORY_STAFF", "display_name": "Inventory Staff",
            "sort_order": 5, "color": "teal", "is_system": True,
            "permissions": ["dashboard.view", "catalog.view", "catalog.edit", "purchases.view", "purchases.receive"] +
                           [k for k in perm_map.keys() if k.startswith("inventory.")]
        },
        {
            "name": "ACCOUNTANT", "display_name": "Accountant",
            "sort_order": 6, "color": "indigo", "is_system": True,
            "permissions": ["dashboard.view", "sales.view", "sales.export", "purchases.view"] +
                           [k for k in perm_map.keys() if k.startswith("reports.")]
        }
    ]

    for r_data in roles_data:
        r = Role(
            name=r_data["name"],
            display_name=r_data["display_name"],
            sort_order=r_data["sort_order"],
            color=r_data["color"],
            is_system=r_data["is_system"]
        )
        r.permissions = [perm_map[code] for code in r_data["permissions"] if code in perm_map]
        db.add(r)

    await db.commit()
    print("Successfully seeded roles and permissions.")

async def seed():
    await init_db()
    async with AsyncSessionLocal() as db:
        await seed_roles_and_permissions(db)
        
        res = await db.execute(select(User).where(User.email == "admin"))
        if res.scalars().first():
            print("Database already seeded. Skipping.")
            return

        admin_user = User(
            email="admin",
            password_hash=hash_password("admin"),
            full_name="System Administrator",
            full_name_ar="مدير النظام",
            role="SUPER_ADMIN",
            is_active=True
        )
        cashier = User(email="cashier@pharmacy.com", password_hash=hash_password("cashier123"), full_name="Cashier", role="cashier")
        db.add_all([admin_user, cashier])
        
        branch = Branch(name="Main Branch", code="B001", name_ar="الفرع الرئيسي")
        db.add(branch)
        
        await db.commit()

        # Item Type categories (level 1)
        item_types = [
            ("Prescription Medicines", "أدوية وصفية", "pill"),
            ("Over-the-Counter (OTC)", "أدوية بدون وصفة", "pill-bottle"),
            ("Medical Devices", "أجهزة طبية", "monitor"),
            ("Surgical Supplies", "مستلزمات جراحية", "scissors"),
            ("Vitamins & Supplements", "فيتامينات ومكملات", "apple"),
            ("Baby Care", "العناية بالطفل", "baby"),
            ("Personal Care", "العناية الشخصية", "heart"),
            ("Cosmetics", "مستحضرات تجميل", "sparkles"),
            ("First Aid", "الإسعافات الأولية", "cross"),
            ("Laboratory Supplies", "مستلزمات مخبرية", "flask")
        ]
        level_1_cats = {}
        for en, ar, icon in item_types:
            c = MedicineCategory(name_en=en, name_ar=ar, icon=icon, category_level=1, sort_order=0)
            db.add(c)
            level_1_cats[en] = c
        await db.commit()

        # Therapeutic sub-categories (level 2) under Prescription Medicines
        rx_parent_id = level_1_cats["Prescription Medicines"].id
        therapeutics = [
            ("Antibiotics", "مضادات حيوية"),
            ("Pain Relief / Analgesics", "مسكنات الألم"),
            ("Anti-inflammatory", "مضادات الالتهاب"),
            ("Antihistamines", "مضادات الهيستامين"),
            ("Antidiabetics", "أدوية السكري"),
            ("Cardiovascular", "أدوية القلب والأوعية"),
            ("Hypertension", "أدوية الضغط"),
            ("Gastrointestinal", "أدوية الجهاز الهضمي"),
            ("Respiratory", "أدوية الجهاز التنفسي"),
            ("Dermatology", "أدوية الجلدية"),
            ("Ophthalmology", "أدوية العيون"),
            ("ENT", "أدوية الأنف والأذن والحنجرة"),
            ("Neurology", "أدوية الأعصاب"),
            ("Psychiatry", "أدوية نفسية"),
            ("Endocrinology", "أدوية الغدد الصماء"),
            ("Oncology", "أدوية الأورام"),
            ("Urology", "أدوية المسالك البولية"),
            ("Gynaecology", "أدوية النساء والتوليد"),
            ("Paediatrics", "أدوية الأطفال")
        ]
        level_2_cats = {}
        for idx, (en, ar) in enumerate(therapeutics):
            c = MedicineCategory(name_en=en, name_ar=ar, parent_id=rx_parent_id, category_level=2, sort_order=idx)
            db.add(c)
            level_2_cats[en] = c
        await db.commit()

        # Suppliers
        sup_names = ["Al-Dawaa Medical", "Nahdi Wholesale", "Gulf Pharma Supply"]
        suppliers = []
        for name in sup_names:
            s = Supplier(name=name, contact_person="John Doe", phone="0500000000", email="sup@example.com")
            db.add(s)
            suppliers.append(s)
        await db.commit()

        # Customers
        cust_names = [("Mohammed Al-Rashid", "محمد الراشد"), ("Fatima Al-Zahrani", "فاطمة الزهراني")]
        customers = []
        for en, ar in cust_names:
            c = Customer(name=en, name_ar=ar, phone="0511111111")
            db.add(c)
            customers.append(c)
        await db.commit()

        # Medicines
        meds_data = [
            ("Panadol", "بانادول", "Paracetamol", "Panadol", "500mg", "Tablet", "GSK", "Pain Relief / Analgesics", 15.0),
            ("Amoxil", "أموكسيل", "Amoxicillin", "Amoxil", "500mg", "Capsule", "GSK", "Antibiotics", 25.5),
            ("Augmentin", "أوجمنتين", "Amoxicillin/Clavulanate", "Augmentin", "1g", "Tablet", "GSK", "Antibiotics", 80.0),
            ("Brufen", "بروفين", "Ibuprofen", "Brufen", "400mg", "Tablet", "Abbott", "Anti-inflammatory", 12.0),
            ("Voltaren", "فولتارين", "Diclofenac", "Voltaren", "50mg", "Tablet", "Novartis", "Anti-inflammatory", 18.0),
            ("Zyrtec", "زيرتيك", "Cetirizine", "Zyrtec", "10mg", "Tablet", "UCB Pharma", "Antihistamines", 22.0),
            ("Crestor", "كريستور", "Rosuvastatin", "Crestor", "10mg", "Tablet", "AstraZeneca", "Cardiovascular", 150.0),
            ("Lipitor", "ليبيتور", "Atorvastatin", "Lipitor", "20mg", "Tablet", "Pfizer", "Cardiovascular", 120.0),
            ("Ventolin", "فنتولين", "Salbutamol", "Ventolin", "100mcg", "Inhaler", "GSK", "Respiratory", 35.0),
            ("Nexium", "نيكسيوم", "Esomeprazole", "Nexium", "40mg", "Capsule", "AstraZeneca", "Gastrointestinal", 65.0),
            ("Glucophage", "جلوكوفاج", "Metformin", "Glucophage", "500mg", "Tablet", "Merck", "Antidiabetics", 15.0),
            ("Concor", "كونكور", "Bisoprolol", "Concor", "5mg", "Tablet", "Merck", "Hypertension", 40.0),
            ("Losartan", "لوسارتان", "Losartan", "Losartan", "50mg", "Tablet", "MSD", "Hypertension", 30.0),
            ("Omeprazole", "أوميبرازول", "Omeprazole", "Omeprazole", "20mg", "Capsule", "Various", "Gastrointestinal", 45.0),
            ("Aspirin", "أسبرين", "Acetylsalicylic Acid", "Aspirin", "100mg", "Tablet", "Bayer", "Cardiovascular", 10.0),
            ("Cetrizine", "سيتريزين", "Cetirizine", "Cetrizine", "10mg", "Syrup", "Various", "Antihistamines", 14.0),
            ("Metformin XR", "ميتفورمين", "Metformin", "Metformin XR", "1000mg", "Tablet", "Merck", "Antidiabetics", 12.0),
            ("Amlodipine", "أملوديبين", "Amlodipine", "Amlodipine", "5mg", "Tablet", "Pfizer", "Hypertension", 28.0),
            ("Azithromycin", "أزيثروميسين", "Azithromycin", "Azithromycin", "500mg", "Tablet", "Pfizer", "Antibiotics", 55.0),
            ("Ibuprofen Susp", "إيبوبروفين", "Ibuprofen", "Ibuprofen Susp", "100mg/5ml", "Suspension", "Abbott", "Paediatrics", 11.0)
        ]

        medicines = []
        for idx, (en, ar, gen, brand, st, form, man, cat_key, price) in enumerate(meds_data):
            m = Medicine(
                sku=f"SKU{idx:04d}",
                barcode=f"123456789{idx:03d}",
                name_en=en,
                name_ar=ar,
                generic_name=gen,
                brand_name=brand,
                strength=st,
                dosage_form=form,
                manufacturer=man,
                category_id=level_2_cats[cat_key].id,
                base_unit="Pack",
                selling_price=price,
                reorder_level=10
            )
            db.add(m)
            medicines.append(m)
        await db.commit()

        # Batches
        now = datetime.utcnow()
        for idx, m in enumerate(medicines):
            b1 = MedicineBatch(
                medicine_id=m.id,
                batch_number=f"BATCH-A-{idx}",
                production_date=now - timedelta(days=120), # approx 6 months before expiry (if expiry is +60 days)
                expiry_date=now + timedelta(days=60),
                purchase_price=float(m.selling_price) * 0.7,
                quantity_received=50,
                quantity_remaining=50,
                supplier_id=suppliers[0].id
            )
            b2 = MedicineBatch(
                medicine_id=m.id,
                batch_number=f"BATCH-B-{idx}",
                production_date=now - timedelta(days=185), # approx 6 months before expiry (if expiry is +180 days)
                expiry_date=now + timedelta(days=180),
                purchase_price=float(m.selling_price) * 0.7,
                quantity_received=100,
                quantity_remaining=100,
                supplier_id=suppliers[1].id
            )
            db.add_all([b1, b2])
        await db.commit()

        print("Successfully seeded full pharmacy taxonomy and data.")

if __name__ == "__main__":
    asyncio.run(seed())
