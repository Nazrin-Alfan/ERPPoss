import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import FeedbackModal from '../FeedbackModal'
import { supabase } from '../../../supabaseClient'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user_beta_1', email: 'beta@relaypos.com' },
    profile: { id: 'user_beta_1', nama: 'Tester Beta', role: 'Kasir', tenant_id: 'tenant_jb_enterprise' },
    activeTenant: { id: 'tenant_jb_enterprise', nama: 'Outlet Beta 1' },
  }),
}))

describe('FeedbackModal & beta_feedback persistence', () => {
  beforeEach(async () => {
    if (supabase.erp?.resetDatabase) {
      await supabase.erp.resetDatabase()
    }
  })

  it('merender modal masukan dengan 5 tombol rating bintang, kategori, dan textarea', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/pos']}>
        <FeedbackModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    )

    expect(html).toContain('Beri Masukan Beta')
    expect(html).toContain('Beri 1 bintang')
    expect(html).toContain('Beri 5 bintang')
    expect(html).toContain('Bug / Error')
    expect(html).toContain('Saran Fitur')
    expect(html).toContain('/pos')
    expect(html).toContain('Outlet Beta 1')
  })

  it('menyimpan masukan dengan rating bintang ke tabel beta_feedback di local engine', async () => {
    const payload = {
      tenant_id: 'tenant_jb_enterprise',
      user_id: 'user_beta_1',
      user_name: 'Tester Beta',
      user_role: 'Kasir',
      category: 'BUG',
      rating: 5,
      page_path: '/pos',
      message: 'Tombol cetak struk agak lambat di tab kedua.',
      status: 'OPEN',
    }

    const { error: insertErr } = await supabase.from('beta_feedback').insert(payload)
    expect(insertErr).toBeNull()

    const { data, error } = await supabase.from('beta_feedback').select('*')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject(payload)
  })
})
