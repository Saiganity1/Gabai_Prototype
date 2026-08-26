-- ==============================================================================
-- GABAI Disaster Risk Reduction & Safe Navigation Platform
-- Supabase Production PostgreSQL Schema & Realtime Setup
-- ==============================================================================

-- 1. Enable UUID Extension & PostGIS (for spatial calculations)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Create Hazards Table
CREATE TABLE IF NOT EXISTS public.hazards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('flood', 'fire', 'road', 'rain', 'power', 'other')),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    emoji TEXT DEFAULT '⚠️',
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    radius INTEGER DEFAULT 500, -- in meters
    confidence INTEGER DEFAULT 85,
    reports INTEGER DEFAULT 1,
    verified INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Active',
    water_depth_cm INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Citizen Disaster Reports Table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_name TEXT NOT NULL DEFAULT 'Anonymous Citizen',
    type TEXT NOT NULL CHECK (type IN ('flood', 'fire', 'road', 'rain', 'power', 'person', 'other')),
    emoji TEXT DEFAULT '⚠️',
    description TEXT,
    photo_url TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('low', 'medium', 'high')),
    water_depth_level TEXT, -- 'ankle_deep', 'knee_deep', 'waist_deep', 'submerged'
    ai_vision_confidence INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'resolved')),
    location_name TEXT,
    hazard_id UUID REFERENCES public.hazards(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Evacuation Centers Table
CREATE TABLE IF NOT EXISTS public.evacuation_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    address TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 500,
    occupancy INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'standby', 'closed')),
    contact_number TEXT,
    amenities TEXT[] DEFAULT ARRAY['medical', 'water', 'power', 'food'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Emergency Broadcast Alerts Table
CREATE TABLE IF NOT EXISTS public.emergency_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('advisory', 'warning', 'critical', 'evacuation')),
    affected_barangays TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 6. Realtime Publication Setup (Enables instant WebSocket push on client apps)
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.hazards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evacuation_centers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_alerts;

-- ==============================================================================
-- 7. Row Level Security (RLS) Policies
-- ==============================================================================
ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evacuation_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active hazards, evacuation centers, and alerts
CREATE POLICY "Public Read Hazards" ON public.hazards FOR SELECT USING (true);
CREATE POLICY "Public Read Evacuation Centers" ON public.evacuation_centers FOR SELECT USING (true);
CREATE POLICY "Public Read Alerts" ON public.emergency_alerts FOR SELECT USING (true);
CREATE POLICY "Public Read Reports" ON public.reports FOR SELECT USING (true);

-- Allow citizens to submit new reports
CREATE POLICY "Public Insert Reports" ON public.reports FOR INSERT WITH CHECK (true);

-- ==============================================================================
-- 8. Storage Bucket for AI Disaster Photos ('disaster-reports')
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('disaster-reports', 'disaster-reports', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Read Disaster Photos" ON storage.objects FOR SELECT USING (bucket_id = 'disaster-reports');
CREATE POLICY "Public Upload Disaster Photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'disaster-reports');
