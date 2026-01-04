import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import ViewOptions from './ViewOptions';


export default function SelectionBar() {
    const { projects, selectedIds, toggleSelect, selectAll } = useWorkspaceStore();

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Logic inside component or store? Store has selectAll/deselectAll.
        // But toggle behavior is conditional.
        if (selectedIds.size === projects.length) {
            // If all selected, verify deselect logic? 
            // Store `selectAll` selects all. `deselectAll` deselects all.
            // This checkbox is 'checked' if all selected.
            // If user unchecks, we deselect all.
            // If user checks, we select all.
            if (e.target.checked) {
                // This branch shouldn't happen if checked is true?
                // If currently checked (all selected), and user clicks, e.target.checked becomes false.
            }
        }
        // Actually simpler to just call store method based on current state?
        // Projects count > 0 check is needed.
    };

    const allSelected = projects.length > 0 && selectedIds.size === projects.length;
    // const { viewScale, setViewScale } = useWorkspaceStore(); // Handled by ViewOptions component now

    return (
        <div className="flex items-center justify-between mb-6 px-1 py-2">
            <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${allSelected ? 'bg-blue-600 border-blue-600' : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 group-hover:border-blue-500'}`}>
                    {allSelected && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                    <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => {
                            const { selectAll, deselectAll, projects, selectedIds } = useWorkspaceStore.getState();
                            if (selectedIds.size === projects.length) {
                                deselectAll();
                            } else {
                                selectAll();
                            }
                        }}
                        className="hidden"
                    />
                </div>
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
                    全选
                </span>
            </label>

            <div className="flex items-center gap-5">
                <ViewOptions />

                <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
                    共 {projects.length} 个项目
                </span>
            </div>
        </div>
    );
}
