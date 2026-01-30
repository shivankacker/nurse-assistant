import { getServerSuites } from "@/app/api/tests/suites/server";
import Client from "./client";
import { getServerContext } from "@/app/api/context/server";

export default async function Page() {
  const suites = await getServerSuites({ limit: 20, offset: 0 });
  const contexts = await getServerContext();

  return <Client suites={suites} contexts={contexts} />;
}
