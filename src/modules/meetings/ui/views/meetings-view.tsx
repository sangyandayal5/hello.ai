"use client"

import { ErrorState } from "@/components/error-state"
import { LoadingState } from "@/components/loading-state"

import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"

export const MeetingsView = () => {
    const trpc = useTRPC()
    const { data } = useQuery(trpc.meetings.getMany.queryOptions({}))

    return (
        <div>
            {JSON.stringify(data)}
        </div>
    )
}

export const MeetingsViewLoading  = () => {
    return (
        <LoadingState 
            title="Loading meetings"
            description="This may take a few seconds" 
        />
    )
}

export const MeetingsViewError = () => {
    return (
        <ErrorState
            title="Error Loading Meetings"
            description="Something went wrong"
        />
    )
}
