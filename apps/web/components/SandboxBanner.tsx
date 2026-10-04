'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export function SandboxBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .health()
      .then((health) => {
        if (!cancelled) setVisible(health.paymentsMode !== 'production');
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <div role="status" className="bg-amber-50 border-b border-amber-300 text-amber-900 text-sm px-6 py-2 text-center">
      Ambiente de sandbox. Cobranças de PIX e boleto não recebem dinheiro real.
    </div>
  );
}
