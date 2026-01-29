import type { GetNextPageParamFunction } from "@tanstack/react-query";
import { PaginatedResponse } from "./schemas/base";

export const getNextPageParam: GetNextPageParamFunction<
  number,
  PaginatedResponse<unknown>
> = (lastPage, pages) => {
  if (lastPage.hasMore) {
    return pages.length * (lastPage.limit || 10);
  }
  return undefined;
};
