import { cn } from "cn"
import { Loading3Filled } from "@mingcute/react/core-filled"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loading3Filled data-slot="spinner" role="status" aria-label="Loading" className={cn("size-5 animate-spin", className)} {...props} />
  )
}

export { Spinner }
