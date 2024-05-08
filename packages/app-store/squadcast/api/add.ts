import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { symmetricEncrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

import checkSession from "../../_utils/auth";
import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import { metadata } from "../_metadata";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ensure user is authenticated
  checkSession(req);

  if (req.method === "GET") {
    // Get the team ID to support team installations
    const { teamId } = req.query;
    // Redirect to the setup page
    return res.status(200).json({ url: `/apps/${metadata.slug}/setup${teamId ? `?teamId=${teamId}` : ""}` });
  }

  if (req.method === "POST") {
    const formSchema = z.object({
      apiKey: z.string(),
      teamId: z.coerce.number().optional(),
    });

    const { apiKey, teamId } = formSchema.parse(req.body);

    // Verify the API key
    await fetch("https://api.squadcast.fm/v2/organizations", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Invalid API key");
        }
      })
      .catch((error) => {
        logger.error("Invalid API key", error);
        return res.status(400).json({ message: "Invalid API key" });
      });

    // Get user
    const user = await prisma.user.findFirstOrThrow({
      where: {
        id: req.session?.user?.id,
      },
      select: {
        email: true,
        id: true,
      },
    });

    const dataWithUser = {
      type: metadata.type,
      key: { apiKey: symmetricEncrypt(apiKey, process.env.CALENDSO_ENCRYPTION_KEY || "") },
      userId: user.id,
      appId: metadata.slug,
      invalid: false,
    };

    const dataWithTeam = {
      type: metadata.type,
      key: { apiKey: symmetricEncrypt(apiKey, process.env.CALENDSO_ENCRYPTION_KEY || "") },
      userId: null,
      teamId,
      appId: metadata.slug,
      invalid: false,
    };

    const data = teamId ? dataWithTeam : dataWithUser;

    logger.error("Adding this account", data);

    try {
      await prisma.credential.create({
        data,
      });
    } catch (reason) {
      logger.error(`Could not add this ${metadata.name} account`, reason);
      return res.status(500).json({ message: `Could not add this ${metadata.name} account` });
    }

    return res
      .status(200)
      .json({ url: getInstalledAppPath({ variant: metadata.variant, slug: metadata.slug }) });
  }
}
