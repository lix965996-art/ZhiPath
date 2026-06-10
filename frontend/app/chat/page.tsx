import { ChatPanel } from "@/components/chat/ChatPanel";
import { WelcomeCard } from "@/components/onboarding/WelcomeCard";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function ChatPage() {
  return (
    <ErrorBoundary scope="page">
      <ChatPanel />
      <WelcomeCard />
    </ErrorBoundary>
  );
}
