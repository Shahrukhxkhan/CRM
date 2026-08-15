import { TRPCError } from "@trpc/server";

export function databaseUnavailable(): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "The CRM data service is temporarily unavailable. Please try again.",
  });
}

export function recordNotFound(resource: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${resource} was not found or is not available to you.` });
}

export function invalidRelationship(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
