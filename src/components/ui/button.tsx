import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // 기본: KWCAG 2.5.5 최소 44x44px, focus-visible 링 필수
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 min-h-11 min-w-11",
  {
    variants: {
      variant: {
        // 메인 액션 (왔수다!, 보고 버튼)
        default: "bg-main-action text-foreground hover:bg-yellow-400 active:bg-yellow-500",
        // 취소 버튼
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // 위험 (삭제 등)
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // 아웃라인
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        // 텍스트만
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // 링크형
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 rounded-lg px-4",
        lg: "h-14 rounded-2xl px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
