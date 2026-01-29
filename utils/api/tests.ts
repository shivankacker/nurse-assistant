import { request } from ".";
import { LimitOffset } from "../schemas/base";
import { TestSuiteCreatePayload } from "../schemas/tests";

export const testApi = {
  suites: {
    list: (filters: LimitOffset) => request("/tests/suites", "GET", filters),
    create: (data: TestSuiteCreatePayload) =>
      request("/tests/suites", "POST", data),
  },
};
