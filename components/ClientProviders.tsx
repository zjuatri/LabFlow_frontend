'use client';

import React from 'react';
import { AiTestStoreProvider } from './AiTestStore';
import { AuthProvider } from './AuthProvider';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AiTestStoreProvider>{children}</AiTestStoreProvider>
    </AuthProvider>
  );
}
