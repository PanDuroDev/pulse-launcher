"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleFilled, CloseCircleFilled, InformationFilled, Loading3Filled, WarningFilled } from "@mingcute/react/core-filled"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: (
          <CheckCircleFilled className="size-5" />
        ),
        info: (
          <InformationFilled className="size-5" />
        ),
        warning: (
          <WarningFilled className="size-5" />
        ),
        error: (
          <CloseCircleFilled className="size-5" />
        ),
        loading: (
          <Loading3Filled className="size-5 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
