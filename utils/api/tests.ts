import { request } from ".";
import { LimitOffset, PaginatedResponse } from "../schemas/base";
import {
  TestCaseCreatePayload,
  TestCaseSerialized,
  TestSuiteCreatePayload,
  TestSuiteSerialized,
} from "../schemas/tests";

export const testApi = {
  suites: {
    list: (filters: LimitOffset) =>
      request<PaginatedResponse<TestSuiteSerialized>>(
        "/tests/suites",
        "GET",
        filters,
      ),
    create: (data: TestSuiteCreatePayload) =>
      request("/tests/suites", "POST", data),
    get: (id: string) =>
      request<TestSuiteSerialized>(`/tests/suites/${id}`, "GET"),
    cases: {
      update: (suiteId: string, caseId: string, data: TestCaseCreatePayload) =>
        request<TestCaseSerialized>(
          `/tests/suites/${suiteId}/cases/${caseId}`,
          "PUT",
          data,
        ),
      create: (suiteId: string, data: TestCaseCreatePayload) =>
        request(`/tests/suites/${suiteId}/cases`, "POST", data),
      delete: (suiteId: string, caseId: string) =>
        request(`/tests/suites/${suiteId}/cases/${caseId}`, "DELETE"),
    },
  },
};
