import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { HomeHub } from '@/components/home-hub'
export default async function Overview(){const session=await auth.api.getSession({headers:await headers()});const name=session?.user?.name||'there';return <HomeHub name={name}/>}
