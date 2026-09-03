"use client";

import {
  AlertTriangle,
  ArrowUpCircle,
  AudioLines,
  Brain,
  CircleDollarSign,
  Database,
  FileText,
  Home,
  Key,
  type LucideIcon,
  Megaphone,
  Phone,
  TrendingUp,
  UserRound,
  Workflow,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { SidebarTeamSwitcher } from "@/components/layout/SidebarTeamSwitcher";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppConfig } from "@/context/AppConfigContext";
import { useLeadForms } from "@/context/LeadFormsContext";
import { useTelephonyConfigWarnings } from "@/context/TelephonyConfigWarningsContext";
import { useLatestReleaseVersion } from "@/hooks/useLatestReleaseVersion";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type SidebarNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  showsTelephonyWarning?: boolean;
};

type SidebarNavSection = {
  label?: string;
  items: SidebarNavItem[];
};

const TELEPHONY_WARNING_COPY = "Action required";

const NAV_SECTIONS: SidebarNavSection[] = [
  {
    items: [
      {
        title: "Overview",
        url: "/overview",
        icon: Home,
      },
    ],
  },
  {
    label: "BUILD",
    items: [
      {
        title: "Voice Agents",
        url: "/workflow",
        icon: Workflow,
      },
      {
        title: "Campaigns",
        url: "/campaigns",
        icon: Megaphone,
      },
      {
        title: "Models",
        url: "/model-configurations",
        icon: Brain,
      },
      {
        title: "Telephony",
        url: "/telephony-configurations",
        icon: Phone,
        showsTelephonyWarning: true,
      },
      {
        title: "Tools",
        url: "/tools",
        icon: Wrench,
      },
      {
        title: "Files",
        url: "/files",
        icon: Database,
      },
      {
        title: "Recordings",
        url: "/recordings",
        icon: AudioLines,
      },
      {
        title: "Developers",
        url: "/api-keys",
        icon: Key,
      },
    ],
  },
  {
    label: "MANAGE",
    items: [
      {
        title: "Agent Runs",
        url: "/usage",
        icon: TrendingUp,
      },
      {
        title: "Billing",
        url: "/billing",
        icon: CircleDollarSign,
      },
      {
        title: "Reports",
        url: "/reports",
        icon: FileText,
      }
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { provider } = useAuth();
  const { config } = useAppConfig();
  const { openHireExpert } = useLeadForms();
  const {
    telnyxMissingWebhookPublicKeyCount,
    vonageMissingSignatureSecretCount,
  } = useTelephonyConfigWarnings();
  const hasTelephonyWarning =
    telnyxMissingWebhookPublicKeyCount > 0 ||
    vonageMissingSignatureSecretCount > 0;
  const isCollapsed = !isMobile && state === "collapsed";

  // Version info from app config context
  const versionInfo = config ? { ui: config.uiVersion, api: config.apiVersion } : null;

  // Check for updates only on self-hosted (OSS) deployments — cloud is managed for the user.
  const { latest: latestRelease, isBehind, isLatest } = useLatestReleaseVersion(
    versionInfo?.ui,
    { enabled: config?.deploymentMode === "oss" },
  );

  const isActive = (path: string) => pathname.startsWith(path);

  const handleMobileNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const SidebarLink = ({ item }: { item: SidebarNavItem }) => {
    const isItemActive = isActive(item.url);
    const Icon = item.icon;
    const showWarningDot = item.showsTelephonyWarning && hasTelephonyWarning;
    const tooltip = {
      children: (
        <div className="notranslate" translate="no">
          <p>{item.title}</p>
          {showWarningDot && (
            <p className="text-amber-600 dark:text-amber-400">{TELEPHONY_WARNING_COPY}</p>
          )}
        </div>
      ),
    };
    const warningIndicator = (
      <AlertTriangle
        aria-label="Action required on a telephony configuration"
        className={cn(
          "text-amber-500",
          isCollapsed ? "absolute -right-0.5 -top-0.5 h-3 w-3" : "ml-auto h-3.5 w-3.5"
        )}
      />
    );

    return (
      <SidebarMenuButton
        asChild
        isActive={isItemActive}
        tooltip={tooltip}
        className={cn(
          "h-10 rounded-full px-3 transition-all group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:rounded-full!",
          isItemActive
            ? "!bg-primary !font-medium !text-primary-foreground shadow-md hover:!bg-[#074A6E] hover:!text-primary-foreground dark:!bg-[#096092] dark:hover:!bg-[#074A6E]"
            : "!bg-transparent !text-muted-foreground hover:!bg-muted/50 hover:!text-foreground dark:hover:!bg-white/10 dark:hover:!text-white"
        )}
      >
        <Link
          href={item.url}
          onClick={handleMobileNavClick}
          className={cn("relative gap-3", isCollapsed && "justify-center px-0")}
          translate="no"
        >
          <Icon
            className={cn(
              "h-[18px] w-[18px] shrink-0",
              isItemActive ? "text-primary-foreground" : "text-muted-foreground"
            )}
          />
          <span
            className={cn(
              "notranslate min-w-0 flex-1 truncate text-sm",
              isItemActive ? "text-primary-foreground" : "text-muted-foreground",
              isCollapsed && "sr-only"
            )}
            translate="no"
          >
            {item.title}
          </span>
          {showWarningDot && (
            isCollapsed ? (
              warningIndicator
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  {warningIndicator}
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{TELEPHONY_WARNING_COPY}</p>
                </TooltipContent>
              </Tooltip>
            )
          )}
        </Link>
      </SidebarMenuButton>
    );
  };

  // "Hire an Expert" CTA in the sidebar footer.
  const hireExpertButton = isCollapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-[#074A6E] dark:bg-[#096092] dark:hover:bg-[#074A6E]"
          onClick={() => openHireExpert("sidebar")}
          aria-label="Hire an Expert"
        >
          <UserRound className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>Hire an Expert</p>
      </TooltipContent>
    </Tooltip>
  ) : (
    <Button
      size="sm"
      className="h-8 gap-1.5 rounded-full bg-primary px-3 text-xs text-primary-foreground hover:bg-[#074A6E] dark:bg-[#096092] dark:hover:bg-[#074A6E]"
      onClick={() => openHireExpert("sidebar")}
    >
      <UserRound className="h-3.5 w-3.5" />
      Hire an Expert
    </Button>
  );

  return (
    <Sidebar collapsible="icon" variant="floating" className="app-sidebar-dock py-3 pl-3">
      <SidebarHeader className="border-b border-border/60 px-4 py-4 notranslate dark:border-white/10" translate="no">
        <div className={cn("flex items-center gap-2", isCollapsed ? "flex-col" : "justify-between")}>
          {isCollapsed ? (
            <Link href="/" className="notranslate flex justify-center" translate="no">
              <BrandLogo mark className="h-7" />
            </Link>
          ) : null}
          <div className={cn("flex min-w-0 flex-1 items-center gap-2", isCollapsed && "hidden")}>
            <Link
              href="/"
              className="notranslate flex min-w-0 items-center"
              translate="no"
            >
              <BrandLogo className="h-8" />
            </Link>
            {isBehind && latestRelease && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href="https://docs.dograh.com/deployment/update"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-900 transition-opacity hover:opacity-80 dark:bg-amber-950 dark:text-amber-200"
                  >
                    <ArrowUpCircle className="h-3 w-3" />
                    Update
                  </a>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Latest: {latestRelease} - click to see the update guide</p>
                </TooltipContent>
              </Tooltip>
            )}
            {isLatest && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center rounded-md border bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    Latest
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>You&apos;re running the latest release</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {provider === "stack" && (
          <div className={cn("mt-3 notranslate", isCollapsed && "hidden")} translate="no">
            <SidebarTeamSwitcher />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className={cn("px-3 py-4 notranslate", isCollapsed && "px-2")} translate="no">
        {NAV_SECTIONS.map((section, index) => (
          <SidebarGroup
            key={section.label ?? "overview"}
            className={index === 0 ? "mt-0" : "mt-5"}
          >
            {section.label && (
              <SidebarGroupLabel
                className={cn(
                  "notranslate mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80",
                  isCollapsed && "hidden"
                )}
                translate="no"
              >
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarMenu className="gap-1.5">
              {section.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarLink item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter
        className={cn("p-3 notranslate", isCollapsed && "p-2")}
        translate="no"
      >
        <div className="flex justify-center">
          {hireExpertButton}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
