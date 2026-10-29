-- schema.sql
-- Run this in your Supabase SQL Editor

-- 1. Drop existing tables to apply the new schema cleanly
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.workspaces CASCADE;

-- 2. Create a Workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Documents table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    storage_path TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS (Row Level Security)
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Workspaces Policy: Users can only select/insert/update/delete their own workspaces
CREATE POLICY "Users can manage their own workspaces" 
ON public.workspaces FOR ALL 
USING (auth.uid() = owner_id) 
WITH CHECK (auth.uid() = owner_id);

-- Documents Policy: Users can only see documents in their workspaces
CREATE POLICY "Users can manage documents in their workspaces" 
ON public.documents FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.workspaces 
        WHERE workspaces.id = documents.workspace_id 
        AND workspaces.owner_id = auth.uid()
    )
) 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.workspaces 
        WHERE workspaces.id = documents.workspace_id 
        AND workspaces.owner_id = auth.uid()
    )
);

-- 5. Set up Supabase Storage Bucket for documents (PRIVATE - access via ownership policies & signed URLs)
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT (id) DO UPDATE SET public = false;

-- Remove the legacy public policy if it exists
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their workspace documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can insert their workspace documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their workspace documents" ON storage.objects;

-- Users may access objects only inside their own workspace folder (path = workspace_id/document_id.pdf)
CREATE POLICY "Users can read their workspace documents"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'documents'
    AND EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.owner_id = auth.uid()
          AND (storage.objects.name)::text LIKE (w.id || '/%')
    )
);

CREATE POLICY "Users can insert their workspace documents"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.owner_id = auth.uid()
          AND (storage.objects.name)::text LIKE (w.id || '/%')
    )
);

CREATE POLICY "Users can delete their workspace documents"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'documents'
    AND EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.owner_id = auth.uid()
          AND (storage.objects.name)::text LIKE (w.id || '/%')
    )
);

-- 6. Create Profiles table for Company Onboarding
DROP TABLE IF EXISTS public.profiles CASCADE;
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    company_name TEXT,
    industry TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own profile" 
ON public.profiles FOR ALL 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- 7. Analytics Tables
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.chats CASCADE;

CREATE TABLE public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    citations JSONB,  -- Source citations stored alongside assistant answers
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage chats in their workspaces" 
ON public.chats FOR ALL 
USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE workspaces.id = chats.workspace_id AND workspaces.owner_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE workspaces.id = chats.workspace_id AND workspaces.owner_id = auth.uid())
);

CREATE POLICY "Users can manage messages in their workspaces" 
ON public.messages FOR ALL 
USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE workspaces.id = messages.workspace_id AND workspaces.owner_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE workspaces.id = messages.workspace_id AND workspaces.owner_id = auth.uid())
);

-- 8. Embeddable Widget Settings
-- One row per workspace. `publishable_key` is safe to expose in a public
-- embed script: it only permits asking questions against that one workspace.
DROP TABLE IF EXISTS public.widget_settings CASCADE;
CREATE TABLE public.widget_settings (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    publishable_key TEXT NOT NULL UNIQUE,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    allow_source_access BOOLEAN NOT NULL DEFAULT false,
    welcome_message TEXT DEFAULT 'Ask me anything about our documents.',
    allowed_origins TEXT[] NOT NULL DEFAULT '{}',  -- empty = any domain
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.widget_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage widget settings for their workspaces" 
ON public.widget_settings FOR ALL 
USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE workspaces.id = widget_settings.workspace_id AND workspaces.owner_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE workspaces.id = widget_settings.workspace_id AND workspaces.owner_id = auth.uid())
);

-- 9. Helpful indexes for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON public.documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chats_workspace ON public.chats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON public.messages(chat_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_widget_publishable_key ON public.widget_settings(publishable_key);

-- 10. PERFORMANCE / SECURITY NOTE
-- The API server uses the Supabase SERVICE ROLE key (server-side only).
-- All table & storage access for end users remains protected by the RLS policies above.
-- Never place SUPABASE_SERVICE_ROLE_KEY in the Next.js app or any client bundle.
