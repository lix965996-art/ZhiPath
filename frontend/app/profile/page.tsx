import { LearnerProfileDashboard } from "@/components/profile/LearnerProfileDashboard";
import { LearningShell } from "@/components/learning/LearningShell";

export default function ProfilePage() {
  return (
    <LearningShell fullWidth>
      <LearnerProfileDashboard />
    </LearningShell>
  );
}
