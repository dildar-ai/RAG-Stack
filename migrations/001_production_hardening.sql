-- migrations/001_production_hardening.sql
-- NON-DESTRUCTIVE migration for databases already created from schema.sql.
-- Safe to run in the Supabase SQL Editor on a live project (keeps existing data).
-- New projects can just run schema.sql instead.

-- 1. Persist citation metadata alongside assistant answers
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS citations JSONB;

-- 2. Make the documents bucket PRIVATE (was public by default)
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- 3. Replace the legacy "Public Access" storage policy with ownership-scoped ones
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their workspace documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can insert their workspace documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their workspace documents" ON storage.objects;

CREATE POLICY "Users can read their workspace documents"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'documents'
    AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.owner_id = auth.uid()
          AND (storage.objects.name)::text LIKE (w.id || '/%')
    )
);

CREATE POLICY "Users can insert their workspace documents"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.owner_id = auth.uid()
          AND (storage.objects.name)::text LIKE (w.id || '/%')
    )
);

CREATE POLICY "Users can delete their workspace documents"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'documents'
    AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.owner_id = auth.uid()
          AND (storage.objects.name)::text LIKE (w.id || '/%')
    )
);

-- 4. Embeddable widget settings (one row per workspace, created from the UI)
CREATE TABLE IF NOT EXISTS public.widget_settings (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    publishable_key TEXT NOT NULL UNIQUE,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    allow_source_access BOOLEAN NOT NULL DEFAULT false,
    welcome_message TEXT DEFAULT 'Ask me anything about our documents.',
    allowed_origins TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.widget_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage widget settings for their workspaces" ON public.widget_settings;
CREATE POLICY "Users can manage widget settings for their workspaces"
ON public.widget_settings FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.workspaces WHERE workspaces.id = widget_settings.workspace_id AND workspaces.owner_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workspaces WHERE workspaces.id = widget_settings.workspace_id AND workspaces.owner_id = auth.uid())
);

-- 5. Indexes for multi-tenant query performance
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON public.documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chats_workspace ON public.chats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON public.messages(chat_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_widget_publishable_key ON public.widget_settings(publishable_key);
