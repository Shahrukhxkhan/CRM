import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  const label = typeof children === "string" ? children.toLowerCase() : "";
  const isRelationshipStage = variant === "secondary" && ["lead", "prospecting", "qualified", "proposal", "negotiation", "won", "lost"].includes(label);
  const semanticTone = variant === "secondary"
    ? label === "archived" ? "border-amber-200 bg-amber-50 text-amber-800"
      : ["lead", "prospecting"].includes(label) ? "border-slate-200 bg-slate-100 text-slate-700"
        : ["qualified", "proposal", "negotiation"].includes(label) ? "border-blue-200 bg-blue-50 text-blue-800"
          : ["won", "accepted", "completed"].includes(label) ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : ["lost", "declined"].includes(label) ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-slate-200 bg-slate-100 text-slate-700"
    : "";

  if (isRelationshipStage) {
    return <span className="inline-flex items-center gap-1.5"><span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Active</span><Comp data-slot="badge" className={cn(badgeVariants({ variant }), semanticTone, className)} {...props}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70"/>{children}</Comp></span>;
  }

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), semanticTone, className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
