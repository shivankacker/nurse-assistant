"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API } from "@/utils/api";
import { Loader2 } from "lucide-react";
import { LLMS } from "@/utils/constants";
import { TestRunSerialized } from "@/utils/schemas/tests";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

// Calculate average scores from completed runs
const calculateAverageScores = (runs: TestRunSerialized["runs"]) => {
  const completedRuns = runs.filter(
    (r) =>
      r.status === "COMPLETED" && r.cosineSimScore && r.bleuScore && r.llmScore,
  );

  if (completedRuns.length === 0) return null;

  const sum = completedRuns.reduce(
    (acc, r) => ({
      cosineSimScore: acc.cosineSimScore + (r.cosineSimScore || 0),
      bleuScore: acc.bleuScore + (r.bleuScore || 0),
      llmScore: acc.llmScore + (r.llmScore || 0),
    }),
    { cosineSimScore: 0, bleuScore: 0, llmScore: 0 },
  );

  return {
    cosineSimScore: sum.cosineSimScore / completedRuns.length,
    bleuScore: sum.bleuScore / completedRuns.length,
    llmScore: sum.llmScore / completedRuns.length,
    average:
      (sum.cosineSimScore + sum.bleuScore + sum.llmScore) /
      (completedRuns.length * 3),
  };
};

export default function Client(props: { run: TestRunSerialized }) {
  const { run: initial } = props;

  const runQuery = useQuery({
    queryKey: ["run", initial.id],
    queryFn: () => API.tests.runs.get(initial.id),
    refetchInterval: 10000,
    initialData: initial,
  });

  const run = runQuery.data;

  const downloadCSV = () => {
    // Generate CSV content
    const headers = "question,expectedanswer,answerrecieved\n";
    const rows = run.runs
      .map((r) => {
        const tcase = run.suite.testCases.find((tc) => tc.id === r.caseId);
        if (!tcase) return null;

        // Escape quotes and wrap in quotes if contains comma or quote
        const escapeCSV = (str: string) => {
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        return `${escapeCSV(tcase.questionText || "")},${escapeCSV(tcase.expectedAnswer)},${escapeCSV(r.answer || "")}`;
      })
      .filter(Boolean)
      .join("\n");

    const csvContent = headers + rows;

    // Create blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `test-run-${run.id}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTimeTaken = () => {
    const start = dayjs(run.createdAt);
    const end = run.completedAt ? dayjs(run.completedAt) : dayjs();
    const diffInSeconds = end.diff(start, "second");

    const hours = Math.floor(diffInSeconds / 3600);
    const minutes = Math.floor((diffInSeconds % 3600) / 60);
    const seconds = diffInSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(" ");
  };

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
      name: "Time Taken",
      value: getTimeTaken(),
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

  const averageScores = calculateAverageScores(run.runs);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2">{run.suite.name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {isFailed && (
              <Badge variant="destructive" className="text-sm">
                Failed
              </Badge>
            )}
            {isRunning && (
              <Badge variant="default" className="text-sm animate-pulse">
                Running - {completePercentage}% Complete
              </Badge>
            )}
            {isComplete && (
              <Badge variant="default" className="text-sm bg-green-600">
                Completed
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {run.runs.length} test case{run.runs.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <Button onClick={downloadCSV} variant="outline" size="sm">
          Download CSV
        </Button>
      </div>

      {/* Average Score Card */}
      {averageScores && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-lg">Overall Performance</CardTitle>
            <CardDescription>
              Average scores across all completed test cases
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">
                  {getScorePercentage(averageScores.average)}%
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Overall Average
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold">
                  {getScorePercentage(averageScores.cosineSimScore)}%
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Cosine Similarity
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold">
                  {getScorePercentage(averageScores.bleuScore)}%
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  BLEU Score
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold">
                  {getScorePercentage(averageScores.llmScore)}%
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  LLM Score
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration & Test Cases */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Card */}
        <div className="lg:col-span-1">
          <Card className="h-fit sticky top-4">
            <CardHeader>
              <CardTitle className="text-lg">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {metrics.map((metric) => (
                <div key={metric.name} className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-medium uppercase">
                    {metric.name}
                  </span>
                  <span
                    className={
                      metric.name === "Prompt"
                        ? "text-sm mt-0.5 whitespace-pre-wrap overflow-wrap-anywhere"
                        : "text-sm mt-0.5"
                    }
                  >
                    {metric.value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Test Cases */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold">Test Cases</h2>
          {run.runs.map((r, index) => {
            const tcase = run.suite.testCases.find((tc) => tc.id === r.caseId);

            if (!tcase) return null;

            const hasScores = r.cosineSimScore && r.bleuScore && r.llmScore;
            const avgScore = hasScores
              ? (r.cosineSimScore! + r.bleuScore! + r.llmScore!) / 3
              : null;

            return (
              <Card key={r.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-base font-semibold">
                      {index + 1}. {tcase.questionText}
                    </CardTitle>
                    {r.status === "RUNNING" && (
                      <Badge variant="outline" className="shrink-0">
                        Running...
                      </Badge>
                    )}
                    {r.status === "FAILED" && (
                      <Badge variant="destructive" className="shrink-0">
                        Failed
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {r.status === "RUNNING" && (
                    <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-900">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {r.answer
                            ? "Computing scores..."
                            : "Processing question..."}
                        </div>
                        <div className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                          Please wait while the AI generates and evaluates the
                          response
                        </div>
                      </div>
                    </div>
                  )}
                  {r.status === "FAILED" && r.failReason && (
                    <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-md border border-red-200 dark:border-red-900">
                      <div className="text-xs font-medium text-red-900 dark:text-red-100 mb-1">
                        FAILURE REASON
                      </div>
                      <div className="text-sm text-red-800 dark:text-red-200">
                        {r.failReason}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-muted-foreground font-medium mb-1">
                      AI RESPONSE
                    </div>
                    <div className="text-sm bg-muted/50 p-3 rounded-md">
                      {r.answer ||
                        (r.status === "RUNNING"
                          ? "Processing..."
                          : "No response yet")}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium mb-1">
                      EXPECTED ANSWER
                    </div>
                    <div className="text-sm">{tcase.expectedAnswer}</div>
                  </div>
                </CardContent>
                {hasScores && (
                  <CardFooter className="bg-muted/30 flex-col gap-3 items-start">
                    <div className="w-full">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          PERFORMANCE SCORES
                        </span>
                        {avgScore && (
                          <span className="text-sm font-semibold">
                            Avg: {getScorePercentage(avgScore)}%
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-2 bg-background rounded">
                          <div className="text-lg font-semibold">
                            {getScorePercentage(r.cosineSimScore!)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Cosine Sim
                          </div>
                        </div>
                        <div className="text-center p-2 bg-background rounded">
                          <div className="text-lg font-semibold">
                            {getScorePercentage(r.bleuScore!)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            BLEU Score
                          </div>
                        </div>
                        <div className="text-center p-2 bg-background rounded">
                          <div className="text-lg font-semibold">
                            {getScorePercentage(r.llmScore!)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            LLM Score
                          </div>
                        </div>
                      </div>
                    </div>
                    {r.llmScoreReason && (
                      <div className="w-full">
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          LLM EVALUATION
                        </div>
                        <div className="text-xs bg-background p-2 rounded italic">
                          {r.llmScoreReason}
                        </div>
                      </div>
                    )}
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
