import { EmptyState } from "@/components/ui/empty-state"


export const ProcessingState = () => {
    return (
        <div className="bg-white rounded-lg px-4 py-5 flex flex-col gap-y-8 items-center justify-center">
            <EmptyState
                image="/processing.svg"
                title="Meeting is completed"
                description="Meeting is completed. Transcript will appear soon"
            />
        </div>
    )
}