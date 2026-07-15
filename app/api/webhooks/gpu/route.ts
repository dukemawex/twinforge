import { createHmac,timingSafeEqual } from "node:crypto"
import { NextRequest,NextResponse } from "next/server"
import { db } from "@/lib/db"
import { renderJobs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
export async function POST(req:NextRequest){const secret=process.env.GPU_WEBHOOK_SECRET;if(!secret)return NextResponse.json({error:"Webhook unavailable"},{status:503});const raw=await req.text();const supplied=req.headers.get("x-twinforge-signature")||"";const expected=createHmac("sha256",secret).update(raw).digest("hex");const valid=supplied.length===expected.length&&timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));if(!valid)return NextResponse.json({error:"Invalid signature"},{status:401});const body=JSON.parse(raw) as {jobId?:string,status?:string,progress?:number,stage?:string,error?:string};if(!body.jobId)return NextResponse.json({error:"Missing jobId"},{status:400});await db.update(renderJobs).set({status:body.status||"processing",progress:Math.max(0,Math.min(100,body.progress||0)),stage:body.stage,error:body.error,updatedAt:new Date()}).where(eq(renderJobs.externalJobId,body.jobId));return NextResponse.json({ok:true})}
