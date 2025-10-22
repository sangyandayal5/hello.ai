import { EmptyState } from "@/components/ui/empty-state"


export const CancelledState = () => {
    return (
        <div className="bg-white rounded-lg px-4 py-5 flex flex-col gap-y-8 items-center justify-center">
            <EmptyState
                image="/cancelled.svg"
                title="Meeting cancelled"
                description="Meeting is no longer available"
            />
        </div>
    )
}