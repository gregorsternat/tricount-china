import { YearDashboard } from "@/components/dashboard/year-dashboard";
import { createDemoDashboard } from "@/lib/dashboard/demo";
import { currentMonthKey, isMonthKey } from "@/lib/dashboard/period";

export const dynamic = "force-dynamic";

interface HomeProps {
  readonly searchParams: Promise<{
    month?: string | string[];
    scope?: string | string[];
    groupId?: string | string[];
  }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const requestedMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const month = isMonthKey(requestedMonth) ? requestedMonth : currentMonthKey();
  const requestedScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const scope = requestedScope === "group" ? "group" : "personal";
  const requestedGroupId = Array.isArray(params.groupId) ? params.groupId[0] : params.groupId;
  const localDesignPreview =
    process.env.NODE_ENV !== "production" && !process.env.BETTER_AUTH_SECRET;
  if (localDesignPreview) {
    return (
      <YearDashboard
        initialData={createDemoDashboard(scope, month, requestedGroupId)}
        demoMode
      />
    );
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
  const dashboard = await getUiDashboardSnapshot(viewer, scope, requestedGroupId, month);
  return <YearDashboard initialData={dashboard} />;
}
