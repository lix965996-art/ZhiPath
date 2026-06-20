import { SystemOverview } from "@/components/overview/SystemOverview";
import { LearningShell } from "@/components/learning/LearningShell";

export default function OverviewPage() {
  return (
    <LearningShell fullWidth>
      <SystemOverview />
    </LearningShell>
  );
}
