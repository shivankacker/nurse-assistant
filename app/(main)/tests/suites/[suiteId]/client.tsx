"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { API } from "@/utils/api";
import {
  TestCaseCreatePayload,
  testCaseCreateSchema,
  TestSuiteSerialized,
} from "@/utils/schemas/tests";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlayIcon } from "lucide-react";
import { toast } from "sonner";

export default function Client(props: { suite: TestSuiteSerialized }) {
  const { suite: serverSuite } = props;

  const suiteQuery = useQuery({
    queryKey: ["suites", serverSuite.id],
    queryFn: () => API.tests.suites.get(serverSuite.id),
    initialData: serverSuite,
  });

  const createCaseMutation = useMutation({
    mutationFn: (data: TestCaseCreatePayload) =>
      API.tests.suites.cases.create(serverSuite.id, data),
    onSuccess: () => {
      toast.success("Test case created successfully");
      suiteQuery.refetch();
      createCaseForm.reset();
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (caseId: string) =>
      API.tests.suites.cases.delete(serverSuite.id, caseId),
    onSuccess: () => {
      toast.success("Test case deleted successfully");
      suiteQuery.refetch();
    },
  });

  const suite = suiteQuery.data;

  const createCaseForm = useForm({
    defaultValues: {
      questionText: "",
      questionAudioPath: "",
      questionImagePath: "",
      expectedAnswer: "",
    } as TestCaseCreatePayload,
    validators: {
      onSubmit: testCaseCreateSchema,
    },
    onSubmit: async ({ value }) => {
      createCaseMutation.mutate({
        questionText: "questionText" in value ? value.questionText : undefined,
        questionAudioPath:
          "questionAudioPath" in value ? value.questionAudioPath : undefined,
        questionImagePath: ("questionImagePath" in value
          ? value.questionImagePath
          : undefined) as string,
        expectedAnswer: value.expectedAnswer,
      });
    },
  });

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
              <Button>
                <PlayIcon />
                Run
              </Button>
            </SheetTrigger>
          </Sheet>
        </div>
      </div>
      <h2 className="text-lg font-semibold mt-8">Questions</h2>
      <div className="flex flex-col gap-4 mt-4">
        {suite.testCases.map((testCase) => (
          <Card key={testCase.id}>
            <CardHeader>
              <CardTitle>Q : {testCase.questionText}</CardTitle>
              <CardDescription>A : {testCase.expectedAnswer}</CardDescription>
              <CardAction>
                <Button variant="outline">Edit</Button>
                <Button
                  variant="link"
                  className="text-red-500"
                  onClick={() => deleteCaseMutation.mutate(testCase.id)}
                >
                  Delete
                </Button>
              </CardAction>
            </CardHeader>
          </Card>
        ))}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant={"secondary"}>Add new question</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Create Test Case</SheetTitle>
            </SheetHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createCaseForm.handleSubmit();
              }}
            >
              <FieldGroup className="px-4">
                <createCaseForm.Field
                  name="questionText"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>
                          Question Text
                        </FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                          placeholder="Enter question text"
                          autoComplete="off"
                        />
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    );
                  }}
                />
                <createCaseForm.Field
                  name="expectedAnswer"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>
                          Expected Answer
                        </FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                          placeholder="Enter expected answer"
                          autoComplete="off"
                        />
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    );
                  }}
                />
              </FieldGroup>

              <SheetFooter>
                <Button disabled={createCaseMutation.isPending} type="submit">
                  Submit
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
