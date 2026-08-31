import { YearDashboard } from "@/components/dashboard/year-dashboard";
import { createDemoDashboard } from "@/lib/dashboard/demo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const localDesignPreview =
    process.env.NODE_ENV !== "production" && !process.env.BETTER_AUTH_SECRET;
  if (localDesignPreview) {
    return <YearDashboard initialData={createDemoDashboard("personal")} demoMode />;
  }

  const [{ redirect }, { getCurrentSession }, { getUiDashboardSnapshot }] =
    await Promise.all([
      import("next/navigation"),
      import("@/lib/server/auth-session"),
      import("@/lib/server/ui-dashboard"),
  ]);
  const session = await getCurrentSession();
  const user = session?.user;
  if (!user) return redirect("/login");

  const viewer = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  };
  const dashboard = await getUiDashboardSnapshot(viewer, "personal");
  return <YearDashboard initialData={dashboard} />;
}
