import { useState } from 'react';

export function BrandLogo({
  size = 28,
  showWordmark = true,
}: {
  size?: number;
  showWordmark?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      {!imgFailed ? (
        <img
          src={`${import.meta.env.BASE_URL}src/assets/images/soulhub_brand_emblem_1795710290700.jpg`}
          alt="SOUL HUB emblem"
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="rounded-lg object-cover border border-slate-200/80 dark:border-slate-800 shrink-0"
          style={{ width: size, height: size }}
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          aria-hidden="true"
          className="rounded-lg shrink-0"
        >
          <rect width="64" height="64" rx="14" fill="#0B101B" />
          <path d="M32 10a16 16 0 1 0 13.8 24.1" fill="none" stroke="#E2E8F0" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M32 54a16 16 0 1 0-13.8-24.1" fill="none" stroke="#3B82F6" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="32" cy="32" r="4" fill="#7C3AED" />
        </svg>
      )}
      {showWordmark && (
        <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          SOUL HUB
        </span>
      )}
    </span>
  );
}
