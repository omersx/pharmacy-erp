import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "data", "pharmacy.db")
con = sqlite3.connect(db_path)
cur = con.cursor()

sales_cols = [c[1] for c in cur.execute("PRAGMA table_info(sales)").fetchall()]
print("Current sales columns:", sales_cols)

if "is_invoiced" not in sales_cols:
    cur.execute("ALTER TABLE sales ADD COLUMN is_invoiced BOOLEAN DEFAULT 0")
    print("Added is_invoiced")

if "invoice_status" not in sales_cols:
    cur.execute("ALTER TABLE sales ADD COLUMN invoice_status VARCHAR DEFAULT 'NOT_INVOICED'")
    print("Added invoice_status")

if "customer_invoice_id" not in sales_cols:
    cur.execute("ALTER TABLE sales ADD COLUMN customer_invoice_id VARCHAR")
    print("Added customer_invoice_id")

con.commit()

inv_cols = [c[1] for c in cur.execute("PRAGMA table_info(inventory_movements)").fetchall()]
print("Current inventory_movements columns:", inv_cols)

if "from_location_id" not in inv_cols:
    cur.execute("ALTER TABLE inventory_movements ADD COLUMN from_location_id VARCHAR")
    print("Added from_location_id")

if "to_location_id" not in inv_cols:
    cur.execute("ALTER TABLE inventory_movements ADD COLUMN to_location_id VARCHAR")
    print("Added to_location_id")

con.commit()

con.close()
print("Migration completed successfully!")
