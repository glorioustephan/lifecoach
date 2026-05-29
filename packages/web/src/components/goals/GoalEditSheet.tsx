import { useEffect, useState } from "react";
import { Sheet, SheetBody, SheetHeader } from "~/components/ui/Sheet";
import { TabNav } from "~/components/ui/TabNav";
import { type GoalRow } from "~/lib/api";
import { OverviewTab } from "./tabs/OverviewTab";
import { MilestonesTab } from "./tabs/MilestonesTab";
import { GoalHabitsTab } from "./tabs/GoalHabitsTab";
import { TasksTab } from "./tabs/TasksTab";
import { EvidenceTab } from "./tabs/EvidenceTab";

interface GoalEditSheetProps {
  goal: GoalRow | null;
  onClose: () => void;
}

type Tab = "overview" | "milestones" | "habits" | "tasks" | "evidence";

/**
 * Sheet-based goal editor. Thin router that switches between four tabs;
 * each tab lives in its own file under `./tabs/` (Wave 5.4 decomposition).
 *
 *  - Overview: every WOOP / kind / cadence field plus archive / status
 *    controls, and the SignalsSection below the form.
 *  - Milestones: linear-ordered list with add / complete / delete.
 *  - Tasks: read-only list of tasks linked to this goal.
 *  - Evidence: log + history of evidence rows.
 *
 * Mirrors the EditArtifactSheet pattern in routes/artifacts.tsx: controlled
 * inputs seeded from the row on open, dirty-guard before close, debounced
 * mutate-on-save (kept in OverviewTab where the form lives).
 */
export function GoalEditSheet({ goal, onClose }: GoalEditSheetProps): JSX.Element | null {
  const [tab, setTab] = useState<Tab>("overview");

  // Reset to overview every time the sheet opens on a different goal so the
  // user lands somewhere predictable.
  useEffect(() => {
    if (goal) setTab("overview");
  }, [goal?.id]);

  if (!goal) return null;

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      side="right"
      width="w-full md:w-[560px]"
    >
      <SheetHeader title={goal.title} onClose={onClose} />
      <TabNav<Tab>
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "milestones", label: "Milestones" },
          { id: "habits", label: "Habits" },
          { id: "tasks", label: "Tasks" },
          { id: "evidence", label: "Evidence" },
        ]}
        active={tab}
        onChange={setTab}
        variant="underline"
        width="none"
      />
      <SheetBody>
        {tab === "overview" && <OverviewTab goal={goal} onClose={onClose} />}
        {tab === "milestones" && <MilestonesTab goal={goal} />}
        {tab === "habits" && <GoalHabitsTab goal={goal} />}
        {tab === "tasks" && <TasksTab goal={goal} />}
        {tab === "evidence" && <EvidenceTab goal={goal} />}
      </SheetBody>
    </Sheet>
  );
}
