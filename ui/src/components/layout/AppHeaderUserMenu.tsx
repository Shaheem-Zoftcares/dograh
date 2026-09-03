"use client";

import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

import ThemeToggle from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LocalUser } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function AppHeaderUserMenu({ className }: { className?: string }) {
  const router = useRouter();
  const { provider, logout, user } = useAuth();

  const displayIdentity =
    user?.displayName ||
    (user as { primaryEmail?: string } | undefined)?.primaryEmail ||
    (user as LocalUser | undefined)?.email ||
    "";
  const displayName =
    user?.displayName ||
    displayIdentity.split("@")[0] ||
    "User";
  const userInitials =
    displayIdentity
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]?.toUpperCase())
      .join("") || "U";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <ThemeToggle
            showLabel={false}
            variant="outline"
            className="h-9 w-9 shrink-0 rounded-full border-border/60 bg-background shadow-sm"
          />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Toggle theme</p>
        </TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-9 max-w-[200px] gap-2 rounded-full border-border/60 bg-background px-2 shadow-sm hover:bg-muted/50 sm:max-w-[240px]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {userInitials}
            </span>
            <span className="hidden min-w-0 truncate text-sm font-medium sm:inline">
              {displayName}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              {provider === "stack" && user?.displayName && (
                <p className="text-sm font-medium">{user.displayName}</p>
              )}
              {provider === "stack" && (user as { primaryEmail?: string })?.primaryEmail && (
                <p className="text-xs text-muted-foreground">
                  {(user as { primaryEmail?: string }).primaryEmail}
                </p>
              )}
              {provider !== "stack" && (user as LocalUser | undefined)?.email && (
                <p className="text-xs text-muted-foreground">{(user as LocalUser).email}</p>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {provider === "stack" && (
            <DropdownMenuItem
              onClick={() => router.push("/handler/account-settings")}
              className="cursor-pointer"
            >
              <Settings className="mr-2 h-4 w-4" />
              Account settings
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => router.push("/settings")} className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Platform Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => logout()} className="cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
