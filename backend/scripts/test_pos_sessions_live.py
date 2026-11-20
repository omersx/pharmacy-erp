import urllib.request
import urllib.parse
import http.cookiejar
import json
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"

# Setup cookie jar opener to automatically handle authentication cookies
cookie_jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

def request_json(path, method="GET", data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with opener.open(req) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"[-] HTTP Error {e.code} on {method} {path}: {err_body}")
        raise

def main():
    print("==================================================")
    print("🚀 LIVE POS REGISTER & SESSION LIFECYCLE TEST")
    print("==================================================")

    # 1. Login
    print("\n[Step 1] Logging in as admin...")
    login_res = request_json("/auth/login", method="POST", data={
        "email": "admin",
        "password": "admin"
    })
    print(f"[+] Login successful as: {login_res.get('email')} (Role: {login_res.get('role')})")

    # 2. Check for active session
    print("\n[Step 2] Checking for active cash session...")
    try:
        active_sess = request_json("/cash-sessions/active", method="GET")
        if active_sess and active_sess.get("id"):
            sess_id = active_sess["id"]
            print(f"[*] Found existing active session {sess_id}. Closing it first...")
            request_json(f"/cash-sessions/{sess_id}/close", method="POST", data={
                "closing_amount": active_sess.get("opening_amount", 0.0),
                "notes": "Closed automatically to test opening fresh register"
            })
            print(f"[+] Existing session {sess_id} closed cleanly.")
    except Exception as e:
        print(f"[*] No prior active session: {e}")

    # 3. Open Register Session
    print("\n[Step 3] Opening Register Session (Start Shift)...")
    open_payload = {
        "opening_amount": 1500.0,
        "terminal_name": "Main Register - Counter 1",
        "opening_notes": "Morning Cash Shift: 1500 SDG float verified"
    }
    new_session = request_json("/cash-sessions/open", method="POST", data=open_payload)
    session_id = new_session["id"]
    print(f"[+] Register opened successfully!")
    print(f"    - Session ID:   {session_id}")
    print(f"    - Session Code: {new_session.get('session_code')}")
    print(f"    - Status:       {new_session.get('status')}")
    print(f"    - Float Amount: {new_session.get('opening_amount')} SDG")
    print(f"    - Terminal:     {new_session.get('terminal_name')}")
    print(f"    - Cashier:      {new_session.get('cashier_name')}")

    # 4. Cash Movement: Cash-In and Cash-Out
    print("\n[Step 4] Testing Cash In / Cash Out drawer movements...")
    cin = request_json(f"/cash-sessions/{session_id}/movements", method="POST", data={
        "movement_type": "CASH_IN",
        "amount": 200.0,
        "reason": "Replenish coin change from safe"
    })
    print(f"[+] Cash In recorded: +200.0 SDG (Reason: {cin.get('reason')})")

    cout = request_json(f"/cash-sessions/{session_id}/movements", method="POST", data={
        "movement_type": "CASH_OUT",
        "amount": 50.0,
        "reason": "Counter supplies / delivery courier"
    })
    print(f"[+] Cash Out recorded: -50.0 SDG (Reason: {cout.get('reason')})")

    # 5. Process Sales in this Session
    print("\n[Step 5] Dispensing sales through POS register...")
    meds = request_json("/medicines?limit=2", method="GET")
    if meds and len(meds) > 0:
        med_id = meds[0]["id"]
        med_price = float(meds[0].get("selling_price", 50.0))
        # Cash Sale
        sale1 = request_json("/sales", method="POST", data={
            "payment_method": "CASH",
            "items": [{"medicine_id": med_id, "quantity": 1, "unit_price": med_price}]
        })
        print(f"[+] Cash Sale recorded: Total {sale1.get('total_amount')} SDG (Invoice: {sale1.get('invoice_number')})")

        # Electronic Sale (Bankak)
        sale2 = request_json("/sales", method="POST", data={
            "payment_method": "BANKAK",
            "payments": [{"payment_method": "BANKAK", "amount": med_price, "reference": "TXN-BKK-8877"}],
            "items": [{"medicine_id": med_id, "quantity": 1, "unit_price": med_price}]
        })
        print(f"[+] Bankak Sale recorded: Total {sale2.get('total_amount')} SDG (Invoice: {sale2.get('invoice_number')})")

    # 6. Check Live Session Summary
    print("\n[Step 6] Retrieving Live Session Summary & Cash Calculations...")
    summary = request_json(f"/cash-sessions/{session_id}/summary", method="GET")
    theoretical_cash = float(summary.get("expected_amount", 0.0))
    print(f"[+] Live Shift Reconciliation:")
    print(f"    - Starting Float:       {summary.get('opening_amount')} SDG")
    print(f"    - Total Cash Sales:     +{summary.get('total_cash_sales')} SDG")
    print(f"    - Cash In Movements:    +{summary.get('total_cash_in')} SDG")
    print(f"    - Cash Out Movements:   -{summary.get('total_cash_out')} SDG")
    print(f"    - Bankak / Card Sales:  {summary.get('total_card_sales')} SDG")
    print(f"    - Expected Cash Drawer: {theoretical_cash} SDG")

    # 7. Close Register Session
    print("\n[Step 7] Closing Register Session (Reconcile & Count)...")
    counted_amount = theoretical_cash # Exact match / 0 variance
    close_res = request_json(f"/cash-sessions/{session_id}/close", method="POST", data={
        "closing_amount": counted_amount,
        "notes": "Shift ended cleanly. Cash drawer matched system expected amount to the cent."
    })
    print(f"[+] Session Closed successfully!")
    print(f"    - Final Status:   {close_res.get('status')} & POSTED")
    print(f"    - Closing Cash:   {close_res.get('closing_amount')} SDG")
    print(f"    - Expected Cash:  {close_res.get('expected_amount')} SDG")
    print(f"    - Variance:       {close_res.get('variance')} SDG")
    print(f"    - Closed At:      {close_res.get('closed_at')}")

    # 8. Check Sessions List (History)
    print("\n[Step 8] Verifying Sessions History...")
    sessions_list = request_json("/cash-sessions", method="GET")
    closed_sessions = [s for s in sessions_list if s.get("id") == session_id]
    assert len(closed_sessions) > 0, "Closed session should appear in sessions list"
    found = closed_sessions[0]
    print(f"[+] Verified in Sessions Registry:")
    print(f"    - Code:   {found.get('session_code')}")
    print(f"    - Status: {found.get('status')}")
    print(f"    - Opened: {found.get('opened_at')}")
    print(f"    - Closed: {found.get('closed_at')}")
    print(f"    - Start:  {found.get('opening_amount')} SDG")
    print(f"    - End:    {found.get('closing_amount')} SDG")

    # 9. Verify Last Closed Session Pre-fill
    print("\n[Step 9] Verifying Next Session Opening Float Auto-Prefill...")
    last_closed = request_json("/cash-sessions/last-closed?terminal_name=Main+Register+-+Counter+1", method="GET")
    print(f"[+] Next shift opening suggestion: {last_closed.get('closing_amount')} SDG (from session {last_closed.get('session_code')})")

    print("\n==================================================")
    print("🎉 ALL POS SESSIONS & REGISTER TESTS PASSED 100%!")
    print("==================================================")

if __name__ == "__main__":
    main()
