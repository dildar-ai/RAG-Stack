from supabase import create_client, Client
import os

_supabase_admin: Client | None = None


def get_supabase_admin() -> Client:
    """
    Returns a lazily initialized Supabase client using the SERVICE ROLE key.
    Bypasses RLS on purpose - every query must still be scoped to an
    ownership-verified workspace. Never expose this key to the frontend.
    """
    global _supabase_admin
    if _supabase_admin is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
        _supabase_admin = create_client(url, key)
    return _supabase_admin
