import { getTwins } from '@/app/actions/data'
import { BatchPreparationForm } from '@/components/preparation-forms'
export default async function Batch(){const twins=await getTwins();return <div className="flex flex-col gap-8"><header><p className="font-mono text-xs uppercase tracking-[.22em] text-primary">Batch production</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">Prepare at scale</h1><p className="mt-3 max-w-2xl text-muted-foreground">Validate a production sheet and save every valid row to the GPU-ready queue.</p></header><BatchPreparationForm twins={twins}/></div>}
