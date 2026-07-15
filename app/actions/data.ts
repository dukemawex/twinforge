"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { renderJobs, twins, videos } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { headers } from "next/headers"

export async function getUserId() { const s = await auth.api.getSession({ headers: await headers() }); if (!s?.user) throw new Error("Unauthorized"); return s.user.id }
export async function getWorkspaceData() { const userId = await getUserId(); const [twinRows, videoRows, jobRows] = await Promise.all([db.select().from(twins).where(eq(twins.userId,userId)).orderBy(desc(twins.createdAt)), db.select().from(videos).where(eq(videos.userId,userId)).orderBy(desc(videos.createdAt)), db.select().from(renderJobs).where(eq(renderJobs.userId,userId)).orderBy(desc(renderJobs.createdAt))]); return { twins:twinRows, videos:videoRows, jobs:jobRows } }
