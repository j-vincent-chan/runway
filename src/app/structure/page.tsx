import { redirect } from "next/navigation";

export default function StructurePage() {
  redirect("/employees?tab=structure");
}
