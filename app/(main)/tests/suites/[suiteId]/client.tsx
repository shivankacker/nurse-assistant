"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { API } from "@/utils/api";
import { TestSuiteSerialized } from "@/utils/schemas/tests";
import { useQuery } from "@tanstack/react-query";

export default function Client(props: { suite: TestSuiteSerialized }) {
  const { suite: serverSuite } = props;

  const suitesQuery = useQuery({
    queryKey: ["suites", serverSuite.id],
    queryFn: () => API.tests.suites.get(serverSuite.id),
    initialData: serverSuite,
  });

  const suite = suitesQuery.data;

  return (
    <div>
      <div className="flex items-center gap-2 justify-between">
        <h1 className="text-2xl font-semibold">
          "{serverSuite.name}" Test Suite
        </h1>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant={"secondary"}>Edit</Button>
            </SheetTrigger>
          </Sheet>
          <Sheet>
            <SheetTrigger asChild>
              <Button>Run</Button>
            </SheetTrigger>
          </Sheet>
        </div>
      </div>
      <div className="flex flex-col gap-4 mt-8"></div>
    </div>
  );
}
