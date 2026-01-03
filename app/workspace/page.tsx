'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import { useAuth } from '@/components/AuthProvider';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

// Sub-components
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceTabs from '@/components/workspace/WorkspaceTabs';
import SelectionBar from '@/components/workspace/SelectionBar';
import ProjectGrid from '@/components/workspace/ProjectGrid';

// Modals
import CreateProjectModal from '@/components/workspace/modals/CreateProjectModal';
import DeleteConfirmModal from '@/components/workspace/modals/DeleteConfirmModal';
import RenameModal from '@/components/workspace/modals/RenameModal';
import TemplateSelectionModal from '@/components/workspace/modals/TemplateSelectionModal';

export default function WorkspacePage() {
  const router = useRouter();
  const { token, isLoading: isAuthLoading } = useAuth();
  const { loadProjects, activeTab } = useWorkspaceStore();

  useEffect(() => {
    if (isAuthLoading) return;
    if (!token) {
      router.push('/login');
      return;
    }
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, token, isAuthLoading, activeTab]); // Reload when tab changes

  if (!token) return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950/50" />;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-blue-500/20">

      {/* Navbar */}
      <SiteHeader />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pt-28 pb-20">

        {/* Page Header */}
        <WorkspaceHeader />

        {/* Tabs */}
        <WorkspaceTabs />

        {/* Content Area */}
        <div className="min-h-[400px]">
          <SelectionBar />
          <ProjectGrid />
        </div>
      </main>

      {/* Modals */}
      <CreateProjectModal />
      <DeleteConfirmModal />
      <TemplateSelectionModal />
      <RenameModal />

    </div>
  );
}
