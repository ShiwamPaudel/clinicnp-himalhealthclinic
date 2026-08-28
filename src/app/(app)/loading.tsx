import { PageSkeleton } from "@/components/app/skeleton";

// Shown in the content area (sidebar stays put) while any back-office tab's
// server render is in flight. One boundary covers every (app) route.
export default function Loading() {
  return <PageSkeleton />;
}
