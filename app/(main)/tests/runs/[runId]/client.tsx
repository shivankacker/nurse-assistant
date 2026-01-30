"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { API } from "@/utils/api";
import { LLMS } from "@/utils/constants";
import { TestRunSerialized } from "@/utils/schemas/tests";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

export default function Client(props: { run: TestRunSerialized }) {
  const { run: initial } = props;

  const runQuery = useQuery({
    queryKey: ["run", initial.id],
    queryFn: () => API.tests.runs.get(initial.id),
    refetchInterval: 10000,
    initialData: initial,
  });

  const run = runQuery.data;

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
      value: LLMS[run.llmModel as keyof typeof LLMS].name || run.llmModel,
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
      value: run.prompt,
    },
  ];

  const isRunning = run.runs.some((r) => r.status === "RUNNING");
  const isComplete = run.runs.every((r) => r.status === "COMPLETED");
  const isFailed = run.runs.some((r) => r.status === "FAILED") && !isRunning;

  const completePercentage = Math.round(
    (run.runs.filter((r) => r.status === "COMPLETED").length /
      run.runs.length) *
      100,
  );

  const getScorePercentage = (int: number) => {
    return Math.round(int * 100);
  };

  return (
    <div>
      <div className="flex items-center gap-2 justify-between">
        <h1 className="text-2xl font-semibold">Test Run</h1>
        <h1 className="text-2xl">
          {isFailed && (
            <span className="text-red-600 font-semibold">FAILED</span>
          )}
          {isRunning && (
            <span className="text-blue-600 font-semibold animate-pulse">
              {" "}
              {completePercentage}% Complete{" "}
            </span>
          )}
          {isComplete && (
            <span className="text-green-600 font-semibold">Complete</span>
          )}
        </h1>
      </div>
      <div className="flex flex-col md:flex-row gap-4 mt-8 ">
        <div className="grid grid-cols-2 gap-1 gap-x-4 opacity-80">
          {metrics.map((metric) => (
            <div key={metric.name}>
              <strong>{metric.name}:</strong> {metric.value}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 w-full md:w-1/3 shrink-0">
          {run.runs.map((r) => {
            const tcase = run.suite.testCases.find((tc) => tc.id === r.caseId);

            if (!tcase) return null;

            return (
              <Card key={r.id} className="pb-0 overflow-hidden">
                <CardHeader>
                  <CardTitle>Q: {tcase.questionText}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="">AI answer : {r.answer}</div>
                  <div className="text-sm opacity-80">
                    Expected Answer : {tcase.expectedAnswer}
                  </div>
                </CardContent>
                <CardFooter className="bg-muted pb-6 pt-2 flex flex-col gap-4">
                  {r.cosineSimScore && r.bleuScore && r.llmScore && (
                    <div className="flex gap-4 justify-between w-full">
                      <div className="flex flex-col">
                        <span className="text-xs">Cosign Sim</span>
                        {getScorePercentage(r.cosineSimScore)}%
                      </div>
                      <div className="flex flex-col">
                        {" "}
                        <span className="text-xs">Bleu Score</span>
                        {getScorePercentage(r.bleuScore)}%
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs">LLM Score</span>
                        {getScorePercentage(r.llmScore)}%
                      </div>
                    </div>
                  )}
                  {r.llmScoreReason && (
                    <div className="text-xs">{r.llmScoreReason}</div>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
