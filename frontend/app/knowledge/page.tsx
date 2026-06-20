import { KnowledgeBasePanel } from "@/components/knowledge/KnowledgeBasePanel";
import { LearningShell } from "@/components/learning/LearningShell";

export default function KnowledgePage() {
  return (
    <LearningShell fullWidth>
      <KnowledgeBasePanel />
    </LearningShell>
  );
}
