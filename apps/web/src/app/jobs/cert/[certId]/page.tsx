'use client';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/use-api';
import { ErrorBox, Spinner } from '@/components/ui';
import { Job, JobCard, JobsNav, JOBS_NOTICE } from '@/components/jobs';

export default function CertJobs() {
  const { certId } = useParams<{ certId: string }>();
  const cert = useApi<{ name: string }>(`/certifications/${certId}`);
  const { data, error, loading, reload } = useApi<{ items: Job[]; total: number }>(`/jobs?certId=${encodeURIComponent(certId)}&sort=deadline`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">{cert.data?.name ?? '자격증'} 관련 공고</h1><JobsNav /></div>
      <p className="text-sm text-ink-soft">이 자격증을 필수·우대하거나 관련 직무로 분류된 공고예요.</p>
      {loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : data!.items.length === 0 ? <p className="card p-8 text-center text-sm text-ink-mute">현재 관련 공고가 없어요.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2">{data!.items.map((j) => <JobCard key={j.id} j={j} />)}</ul>
      )}
      <p className="text-xs text-ink-mute">{JOBS_NOTICE}</p>
    </div>
  );
}
