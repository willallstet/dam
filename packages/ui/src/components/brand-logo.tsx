import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

import { getBrand } from "../brand.js";

export function BrandLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={getBrand().name}
      className={cn("h-[32px] w-[32px]", className)}
      {...props}
    >
      <rect width="32" height="32" rx="8" fill="#008eff" />
      <text
        x="16"
        y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        fontFamily="'IBM Plex Sans', system-ui, sans-serif"
        fontSize="16"
        fontWeight="600"
      >
        {getBrand().name.charAt(0).toUpperCase()}
      </text>
    </svg>
  );
}
