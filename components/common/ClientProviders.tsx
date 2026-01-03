'use client';

import React from 'react';
import { AiTestStoreProvider } from '@/app/ai-test/_components/AiTestStore';
import { AuthProvider } from '@/components/auth/AuthProvider';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AiTestStoreProvider>{children}</AiTestStoreProvider>
    </AuthProvider>
  );
}
