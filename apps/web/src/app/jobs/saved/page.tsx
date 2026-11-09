'use client';
import { useApi } from '@/lib/use-api';
import { useRequireLogin } from '@/lib/use-login';
import { ErrorBox, Spinner } from '@/components/ui';
import { Job, JobCard, JobsNav } from '@/components/jobs';

export default function SavedJobs() {
  const { ready } = useRequireLogin('/jobs/saved');
  const { data, error, loading, reload } = useApi<Job[]>(ready ? '/me/jobs/saved' : null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-black">관심 공고</h1><JobsNav /></div>
      {!ready || loading ? <Spinner /> : error ? <ErrorBox message={error.message} onRetry={reload} /> : data!.length === 0 ? <p className="card p-8 text-center text-sm text-ink-mute">저장한 공고가 없어요.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2">{data!.map((j) => <JobCard key={j.id} j={j} />)}</ul>
      )}
    </div>
  );
}
