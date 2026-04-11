import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CompareView } from "./compare-view";

export default async function ProfileComparePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { slug } = await params;
  return <CompareView slug={slug} />;
}

