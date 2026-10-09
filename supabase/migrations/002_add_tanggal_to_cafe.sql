-- ==============================================================================
-- MIGRATION: Add tanggal & jam columns to cafe table
-- Purpose: Denormalize date/time in cafe table for fast analytics, indexing & consistency with carwash table
-- ==============================================================================

-- 1. Tambahkan kolom tanggal dan jam ke tabel cafe
ALTER TABLE public.cafe 
ADD COLUMN IF NOT EXISTS tanggal DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS jam TIME DEFAULT CURRENT_TIME;

-- 2. Backfill / Sinkronisasi data tanggal & jam dari tabel struk
UPDATE public.cafe c
SET 
    tanggal = COALESCE(
        CASE 
            -- Jika format tanggal di struk adalah YYYY-MM-DD
            WHEN s.tanggal ~ '^\d{4}-\d{2}-\d{2}$' THEN s.tanggal::DATE
            -- Jika format tanggal di struk adalah DD/MM/YYYY atau DD-MM-YYYY
            WHEN s.tanggal ~ '^\d{2}[/-]\d{2}[/-]\d{4}$' THEN TO_DATE(s.tanggal, 'DD/MM/YYYY')
            ELSE CURRENT_DATE
        END,
        CURRENT_DATE
    ),
    jam = COALESCE(
        CASE 
            WHEN s.jam ~ '^\d{2}:\d{2}(:\d{2})?$' THEN s.jam::TIME
            ELSE CURRENT_TIME
        END,
        CURRENT_TIME
    )
FROM public.struk s
WHERE c.id_struk = s.id_struk;

-- 3. Buat composite index untuk akselerasi query analitik & laporan harian cafe
CREATE INDEX IF NOT EXISTS idx_cafe_tanggal ON public.cafe (tanggal);
CREATE INDEX IF NOT EXISTS idx_cafe_struk_tanggal ON public.cafe (id_struk, tanggal);
