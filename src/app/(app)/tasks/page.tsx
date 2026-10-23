import { Suspense } from "react";
import { TasksView } from "@/components/views/TasksView";
export default function Page() { return <Suspense><TasksView /></Suspense>; }
