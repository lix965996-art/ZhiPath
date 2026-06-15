import { Suspense } from "react";
import { ResourceWorkshop } from "@/components/resources/ResourceWorkshop";

export default function ResourcesPage() {
  return (
    <Suspense>
      <ResourceWorkshop />
    </Suspense>
  );
}
