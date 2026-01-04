import { useEditorStore } from "@/stores/useEditorStore";
import { useShallow } from "zustand/react/shallow";

export function SourceEditorPane() {
    const { code, setCode } = useEditorStore(
        useShallow(s => ({
            code: s.code,
            setCode: s.setCode
        }))
    );

    return (
        <textarea
            value={code}
            onChange={(e) => {
                setCode(e.target.value);
            }}
            className="flex-1 w-full p-6 font-mono text-sm text-zinc-900 dark:text-zinc-100 bg-transparent resize-none focus:outline-none leading-relaxed"
            placeholder="Type your Typst code here..."
            spellCheck={false}
        />
    );
}
