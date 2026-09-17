import { getChatGPTUser } from "./chatgpt-auth";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <DashboardClient displayName={user?.fullName?.split(" ")[0] ?? "Rogério"} />;
}
