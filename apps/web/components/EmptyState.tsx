import Link from 'next/link';

export function EmptyState({
  message,
  actionHref,
  actionLabel,
}: {
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-brand-200 bg-white p-6 text-sm text-brand-600">
      <p>{message}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-block mt-3 text-sm bg-brand-900 text-white px-4 py-2 rounded-lg font-medium"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
