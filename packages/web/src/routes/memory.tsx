import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { TabNav } from "~/components/ui/TabNav";
import { FactsTab } from "~/components/memory/FactsTab";
import { DocumentsTab } from "~/components/memory/DocumentsTab";
import { ReflectionsTab } from "~/components/memory/ReflectionsTab";

export const Route = createFileRoute("/memory")({
  component: MemoryRoute,
});

type Tab = "facts" | "documents" | "reflections";

function MemoryRoute(): JSX.Element {
  const [tab, setTab] = useState<Tab>("facts");
  const [factsPage, setFactsPage] = useState(1);
  const [docsPage, setDocsPage] = useState(1);
  const [reflectionsPage, setReflectionsPage] = useState(1);

  const tabs = [
    { id: "facts" as const, label: "Facts" },
    { id: "documents" as const, label: "Documents" },
    { id: "reflections" as const, label: "Reflections" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title="Memory" subtitle="What the coach knows about you" />
      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        <TabNav tabs={tabs} active={tab} onChange={setTab} variant="underline" />
        <div className="mx-auto max-w-2xl px-4 py-4 md:px-6">
          {tab === "facts" && <FactsTab page={factsPage} onPageChange={setFactsPage} />}
          {tab === "documents" && (
            <DocumentsTab page={docsPage} onPageChange={setDocsPage} />
          )}
          {tab === "reflections" && (
            <ReflectionsTab page={reflectionsPage} onPageChange={setReflectionsPage} />
          )}
        </div>
      </div>
    </div>
  );
}
