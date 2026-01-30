"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TEST_RUN_STATUS } from "@/prisma/client/index-browser";
import { API } from "@/utils/api";
import { LLMS } from "@/utils/constants";
import { getNextPageParam } from "@/utils/query-utils";
import { PaginatedResponse } from "@/utils/schemas/base";
import { TestRunSerialized } from "@/utils/schemas/tests";
import { useInfiniteQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import Link from "next/link";
import { InfiniteScroll } from "@/components/infinite-scroll";

export default function Client(props: {
  runs: PaginatedResponse<TestRunSerialized>;
}) {
  const testRunsQuery = useInfiniteQuery({
    queryKey: ["runs"],
    queryFn: ({ pageParam = 0 }) =>
      API.tests.runs.list({ limit: 20, offset: pageParam }),
    initialData: { pages: [props.runs], pageParams: [0] },
    initialPageParam: 0,
    getNextPageParam: getNextPageParam,
  });

  const testRuns = testRunsQuery.data?.pages.flatMap((page) => page.results);

  const calculateAverageScore = (runs: TestRunSerialized["runs"]) => {
    const completedRuns = runs.filter(
      (r) =>
        r.status === "COMPLETED" &&
        r.cosineSimScore &&
        r.bleuScore &&
        r.llmScore,
    );

    if (completedRuns.length === 0) return null;

    const sum = completedRuns.reduce(
      (acc, r) => acc + (r.cosineSimScore! + r.bleuScore! + r.llmScore!) / 3,
      0,
    );

    return sum / completedRuns.length;
  };

  return (
    <div>
      <div className="flex items-center gap-2 justify-between">
        <h1 className="text-2xl font-semibold">Test Runs</h1>
      </div>
      <InfiniteScroll
        onLoadMore={() => testRunsQuery.fetchNextPage()}
        hasMore={testRunsQuery.hasNextPage ?? false}
        isFetching={testRunsQuery.isFetching}
        className="mt-4 flex flex-col gap-4"
      >
        {testRuns.map((run) => {
          const metrics = [
            {
              name: "Started At",
              value: dayjs(run.createdAt).format("DD MMM YYYY, hh:mm A"),
            },
            {
              name: "Completed At",
              value: run.completedAt
                ? dayjs(run.completedAt).format("DD MMM YYYY, hh:mm A")
                : "In Progress",
            },
            {
              name: "LLM",
              value:
                LLMS[run.llmModel as keyof typeof LLMS].name || run.llmModel,
            },
            {
              name: "Temperature",
              value: run.temperature.toString(),
            },
            {
              name: "Top P",
              value: run.topP.toString(),
            },
            {
              name: "Top K",
              value: run.topK.toString(),
            },
            {
              name: "Prompt",
              value:
                run.prompt.slice(0, 30) + (run.prompt.length > 30 ? "..." : ""),
            },
          ];

          const isRunning = run.runs.some((r) => r.status === "RUNNING");
          const isComplete = run.runs.every((r) => r.status === "COMPLETED");
          const isFailed =
            run.runs.some((r) => r.status === "FAILED") && !isRunning;

          const completePercentage = Math.round(
            (run.runs.filter((r) => r.status === "COMPLETED").length /
              run.runs.length) *
              100,
          );

          const averageScore = calculateAverageScore(run.runs);

          return (
            <Link href={`/admin/tests/runs/${run.id}`} key={run.id}>
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="mb-2">{run.suite.name}</CardTitle>
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        {isFailed && (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                        {isRunning && (
                          <Badge variant="default" className="animate-pulse">
                            Running
                          </Badge>
                        )}
                        {isComplete && (
                          <Badge variant="default" className="bg-green-600">
                            Completed
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {run.runs.length} test case
                          {run.runs.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {averageScore !== null && (
                        <div className="mb-3">
                          <div className="text-2xl font-bold text-primary">
                            {Math.round(averageScore * 100)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Average Score
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <CardDescription className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {metrics.map((metric) => (
                      <div key={metric.name} className="flex gap-1">
                        <span className="font-medium text-muted-foreground">
                          {metric.name}:
                        </span>
                        <span className="text-foreground">{metric.value}</span>
                      </div>
                    ))}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </InfiniteScroll>
    </div>
  );
}
