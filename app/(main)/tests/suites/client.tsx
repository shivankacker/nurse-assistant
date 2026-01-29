"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { API } from "@/utils/api";
import { getNextPageParam } from "@/utils/query-utils";
import { PaginatedResponse } from "@/utils/schemas/base";
import { TestSuiteSerialized } from "@/utils/schemas/tests";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";

export default function Client(props: {
  suites: PaginatedResponse<TestSuiteSerialized>;
}) {
  const { suites } = props;

  const [newSuiteName, setNewSuiteName] = useState("");

  const suitesQuery = useInfiniteQuery({
    queryKey: ["suites"],
    queryFn: ({ pageParam = 0 }) =>
      API.tests.suites.list({ limit: 20, offset: pageParam }),
    initialData: { pages: [suites], pageParams: [0] },
    initialPageParam: 0,
    getNextPageParam: getNextPageParam,
  });

  const createSuiteMutation = useMutation({
    mutationFn: () => API.tests.suites.create({ name: newSuiteName }),
  });

  return (
    <div className="flex items-center gap-2 justify-between">
      <h1 className="text-2xl font-semibold">Test Suites</h1>
      <Sheet>
        <SheetTrigger asChild>
          <Button>Create</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Create Test Suite</SheetTitle>
            <SheetDescription>
              Enter the name for the new test suite.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  );
}
