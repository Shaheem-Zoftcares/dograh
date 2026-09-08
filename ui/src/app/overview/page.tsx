"use client";

import { Brain, Workflow } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

const QUICK_ACTIONS = [
    {
        title: "Voice Agents",
        description: "Create and manage agents with the visual workflow editor.",
        href: "/workflow",
        label: "Go to Agents",
        icon: Workflow,
        primary: true,
    },
    {
        title: "Model Configuration",
        description: "Set up LLM, TTS, and STT providers for your organization.",
        href: "/model-configurations",
        label: "Configure Models",
        icon: Brain,
        primary: false,
    },
] as const;

export default function OverviewPage() {
    const { user } = useAuth();
    const firstName = user?.displayName?.split(" ")[0];

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="mx-auto max-w-5xl">
                <header className="mb-6">
                    <p className="type-eyebrow">Overview</p>
                    <h1 className="mt-1">
                        {firstName ? `Welcome, ${firstName}` : "Welcome to Zyli"}
                    </h1>
                    <p className="type-subtitle mt-1 max-w-2xl">
                        Build and deploy voice AI workflows from one place.
                    </p>
                </header>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {QUICK_ACTIONS.map((action) => {
                        const Icon = action.icon;
                        return (
                            <Card key={action.href} className="overflow-hidden">
                                <CardContent className="flex h-full flex-col gap-4 p-5">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 space-y-1">
                                            <h2 className="text-foreground">
                                                {action.title}
                                            </h2>
                                            <p className="text-sm leading-relaxed text-muted-foreground">
                                                {action.description}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        asChild
                                        size="sm"
                                        variant={action.primary ? "default" : "outline"}
                                        className="w-fit"
                                    >
                                        <Link href={action.href}>{action.label}</Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
