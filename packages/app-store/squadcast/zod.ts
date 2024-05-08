import { z } from "zod";

import { eventTypeAppCardZod } from "../eventTypeAppCardZod";

export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    showID: z.string().optional(),
  })
);

export const appKeysSchema = z.object({});
