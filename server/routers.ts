import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createActivity,
  createCompany,
  createContact,
  createFollowUp,
  createQuote,
  deleteActivity,
  deleteCompany,
  deleteContact,
  deleteFollowUp,
  deleteQuote,
  exportContactsCsv,
  getCompany,
  getContact,
  getDashboard,
  getQuote,
  importContactsCsv,
  listCompanies,
  listContacts,
  listFollowUps,
  listQuotes,
  setFollowUpCompletion,
  updateActivity,
  updateCompany,
  updateContact,
  updateContactStage,
  updateFollowUp,
  updateQuote,
  updateQuoteStatus,
} from "./crm/db";
import { PIPELINE_STAGES, QUOTE_STATUSES } from "./crm/constants";
import { MAX_CONTACT_CSV_BYTES } from "./crm/csv";
import {
  activityInputSchema,
  companyInputSchema,
  contactInputSchema,
  followUpInputSchema,
  quoteInputSchema,
  recordIdSchema,
} from "./crm/validation";

const contactListInput = z.object({
  query: z.string().trim().max(255).optional(),
  stage: z.enum(PIPELINE_STAGES).optional(),
  companyId: z.number().int().positive().optional(),
});

const followUpListInput = z.object({
  state: z.enum(["all", "active", "completed", "overdue", "today", "upcoming"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    get: protectedProcedure.query(({ ctx }) => getDashboard(ctx.user.id)),
  }),
  companies: router({
    list: protectedProcedure.query(({ ctx }) => listCompanies(ctx.user.id)),
    get: protectedProcedure.input(recordIdSchema).query(({ ctx, input }) => getCompany(ctx.user.id, input.id)),
    create: protectedProcedure.input(companyInputSchema).mutation(({ ctx, input }) => createCompany(ctx.user.id, input)),
    update: protectedProcedure
      .input(recordIdSchema.extend({ data: companyInputSchema }))
      .mutation(({ ctx, input }) => updateCompany(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(recordIdSchema).mutation(({ ctx, input }) => deleteCompany(ctx.user.id, input.id)),
  }),
  contacts: router({
    list: protectedProcedure.input(contactListInput).query(({ ctx, input }) => listContacts(ctx.user.id, input)),
    get: protectedProcedure.input(recordIdSchema).query(({ ctx, input }) => getContact(ctx.user.id, input.id)),
    create: protectedProcedure.input(contactInputSchema).mutation(({ ctx, input }) => createContact(ctx.user.id, input)),
    update: protectedProcedure
      .input(recordIdSchema.extend({ data: contactInputSchema }))
      .mutation(({ ctx, input }) => updateContact(ctx.user.id, input.id, input.data)),
    changeStage: protectedProcedure
      .input(recordIdSchema.extend({ stage: z.enum(PIPELINE_STAGES) }))
      .mutation(({ ctx, input }) => updateContactStage(ctx.user.id, input.id, input.stage)),
    exportCsv: protectedProcedure.query(({ ctx }) => exportContactsCsv(ctx.user.id)),
    importCsv: protectedProcedure
      .input(z.object({ csv: z.string().max(MAX_CONTACT_CSV_BYTES, "The CSV file exceeds the 1 MB import limit.") }))
      .mutation(({ ctx, input }) => importContactsCsv(ctx.user.id, input.csv)),
    delete: protectedProcedure.input(recordIdSchema).mutation(({ ctx, input }) => deleteContact(ctx.user.id, input.id)),
  }),
  activities: router({
    create: protectedProcedure.input(activityInputSchema).mutation(({ ctx, input }) => createActivity(ctx.user.id, input)),
    update: protectedProcedure
      .input(recordIdSchema.extend({ data: activityInputSchema }))
      .mutation(({ ctx, input }) => updateActivity(ctx.user.id, input.id, input.data)),
    delete: protectedProcedure.input(recordIdSchema).mutation(({ ctx, input }) => deleteActivity(ctx.user.id, input.id)),
  }),
  followUps: router({
    list: protectedProcedure.input(followUpListInput).query(({ ctx, input }) => listFollowUps(ctx.user.id, input)),
    create: protectedProcedure.input(followUpInputSchema).mutation(({ ctx, input }) => createFollowUp(ctx.user.id, input)),
    update: protectedProcedure
      .input(recordIdSchema.extend({ data: followUpInputSchema }))
      .mutation(({ ctx, input }) => updateFollowUp(ctx.user.id, input.id, input.data)),
    setCompletion: protectedProcedure
      .input(recordIdSchema.extend({ completed: z.boolean() }))
      .mutation(({ ctx, input }) => setFollowUpCompletion(ctx.user.id, input.id, input.completed)),
    delete: protectedProcedure.input(recordIdSchema).mutation(({ ctx, input }) => deleteFollowUp(ctx.user.id, input.id)),
  }),
  quotes: router({
    list: protectedProcedure
      .input(z.object({ status: z.enum(QUOTE_STATUSES).optional() }))
      .query(({ ctx, input }) => listQuotes(ctx.user.id, input.status)),
    get: protectedProcedure.input(recordIdSchema).query(({ ctx, input }) => getQuote(ctx.user.id, input.id)),
    create: protectedProcedure.input(quoteInputSchema).mutation(({ ctx, input }) => createQuote(ctx.user.id, input)),
    update: protectedProcedure
      .input(recordIdSchema.extend({ data: quoteInputSchema }))
      .mutation(({ ctx, input }) => updateQuote(ctx.user.id, input.id, input.data)),
    changeStatus: protectedProcedure
      .input(recordIdSchema.extend({ status: z.enum(QUOTE_STATUSES) }))
      .mutation(({ ctx, input }) => updateQuoteStatus(ctx.user.id, input.id, input.status)),
    delete: protectedProcedure.input(recordIdSchema).mutation(({ ctx, input }) => deleteQuote(ctx.user.id, input.id)),
  }),
});

export type AppRouter = typeof appRouter;
