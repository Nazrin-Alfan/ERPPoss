import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({signInWithPassword:vi.fn(),getUser:vi.fn(),profile:vi.fn()}))
vi.mock('../../supabaseClient',()=>({isCloudBackend:true,supabase:{auth:{signInWithPassword:mocks.signInWithPassword,getUser:mocks.getUser},from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.profile})})})}}))
import { api } from '../apiAdapter'
const user={id:'u',email:'user@example.test',role:'authenticated',user_metadata:{role:'Super Admin'}}
const profile={id:'u',tenant_id:'tenant',role:'Kasir'}
beforeEach(()=>{vi.resetAllMocks();mocks.signInWithPassword.mockResolvedValue({data:{user},error:null});mocks.getUser.mockResolvedValue({data:{user},error:null});mocks.profile.mockResolvedValue({data:profile,error:null})})
describe('Cloud adapter requires authoritative ERP profile',()=>{
 it('uses database role rather than auth role or user metadata',async()=>{expect((await api.auth.login('user@example.test','password')).profile).toEqual(profile);expect((await api.auth.getMe()).profile).toEqual(profile)})
 it.each(['login','getMe'])('rejects missing profile in %s instead of metadata fallback',async method=>{mocks.profile.mockResolvedValue({data:null,error:null});await expect(api.auth[method]('user@example.test','password')).rejects.toThrow(/profil/i)})
 it('rejects invalid tenant/role and different profile identity',async()=>{for(const invalid of [{...profile,role:'authenticated'},{...profile,tenant_id:null},{...profile,id:'other'}]){mocks.profile.mockResolvedValue({data:invalid,error:null});await expect(api.auth.login('user@example.test','password')).rejects.toThrow()}})
})
