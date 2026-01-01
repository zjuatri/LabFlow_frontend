'use client';

import React from 'react';
import { AiTestStoreProvider } from './AiTestStore';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AiTestStoreProvider>{children}</AiTestStoreProvider>;
}
