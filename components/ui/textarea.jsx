import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-[#ededed] shadow-xs transition-colors outline-none placeholder:text-[#737373] focus-visible:border-[#474747] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
