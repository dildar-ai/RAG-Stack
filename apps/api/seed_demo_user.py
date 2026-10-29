"""One-off script: seed a demo login (email already confirmed via service role)."""
import os
from dotenv import load_dotenv

load_dotenv(".env")

from supabase import create_client

EMAIL = "demo@ragstack.dev"
PASSWORD = "Demo@RagStack2026!"

sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

# 1. Auth user (created pre-confirmed so password login works instantly)
try:
    res = sb.auth.admin.get_user_by_email(EMAIL)
    uid = res.user.id
    print(f"USER_EXISTS: {uid}")
except Exception:
    res = sb.auth.admin.create_user(
        {"email": EMAIL, "password": PASSWORD, "email_confirm": True}
    )
    uid = res.user.id
    print(f"USER_CREATED: {uid}")

# 2. Profile so the dashboard guard skips onboarding
sb.table("profiles").upsert(
    {"id": uid, "email": EMAIL, "company_name": "Demo Corp", "industry": "Technology"}
).execute()
print("PROFILE_SEEDED")

# 3. A workspace so the dashboard opens straight into something usable
existing = sb.table("workspaces").select("id").eq("owner_id", uid).execute()
if not existing.data:
    sb.table("workspaces").insert({"name": "Demo Workspace", "owner_id": uid}).execute()
    print("WORKSPACE_CREATED")
else:
    print(f"WORKSPACES_EXIST: {len(existing.data)}")

print("DONE")
