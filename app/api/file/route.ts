import { get } from "@vercel/blob"
import { NextRequest,NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mediaAssets } from "@/lib/db/schema"
import { and,eq } from "drizzle-orm"
export async function GET(req:NextRequest){const session=await auth.api.getSession({headers:req.headers});if(!session?.user)return NextResponse.json({error:"Unauthorized"},{status:401});const id=req.nextUrl.searchParams.get("id");if(!id)return NextResponse.json({error:"Missing id"},{status:400});const [asset]=await db.select().from(mediaAssets).where(and(eq(mediaAssets.id,id),eq(mediaAssets.userId,session.user.id))).limit(1);if(!asset)return NextResponse.json({error:"Not found"},{status:404});const result=await get(asset.pathname,{access:"private",ifNoneMatch:req.headers.get("if-none-match")||undefined});if(!result)return new NextResponse("Not found",{status:404});if(result.statusCode===304)return new NextResponse(null,{status:304,headers:{ETag:result.blob.etag,"Cache-Control":"private, no-cache"}});return new NextResponse(result.stream,{headers:{"Content-Type":result.blob.contentType,ETag:result.blob.etag,"Cache-Control":"private, no-cache"}})}
