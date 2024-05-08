import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { symmetricDecrypt } from "@calcom/lib/crypto";
import { prisma } from "@calcom/prisma";

import { metadata } from "../_metadata";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      throw new Error("Invalid method");
    }

    const session = req.session;

    // Ensure user is authenticated
    if (!session || !session.user || !session.user.id || !req.session?.user?.id) {
      return res.status(401).json({ message: "You must be logged in to do this" });
    }

    // If this is a team app, we need to use the team credential. Otherwise, use the user's credential
    const { teamId } = req.query;

    const getTeamCred = prisma.credential.findFirst({
      where: {
        AND: [{ type: metadata.type }, { teamId: parseInt(teamId) }],
      },
    });

    const getUserCred = prisma.credential.findFirst({
      where: {
        AND: [{ type: metadata.type }, { userId: session.user.id }],
      },
    });

    // Get the Squadcast credential
    const getCred = teamId ? getTeamCred : getUserCred;
    const cred = await getCred;

    if (!cred) {
      return res.status(403).json({ message: "You must install the app first" });
    }

    // Decrypt the API key
    const { apiKey } = z
      .object({
        apiKey: z.string(),
      })
      .parse(cred.key);

    const decryptedApiKey = symmetricDecrypt(apiKey, process.env.CALENDSO_ENCRYPTION_KEY || "");

    // Fetch the shows from Squadcast
    const fetched = await fetch("https://api.squadcast.fm/v2/shows", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${decryptedApiKey}`,
        Accept: "application/json",
      },
    });

    if (!fetched.ok) {
      return res.status(500).json({ message: "Could not fetch data from Squadcast" });
    }

    // Parse the response
    const showsSchema = z.array(
      z.object({
        showID: z.string(),
        showDetails: z.object({
          showName: z.string(),
        }),
      })
    );

    // Convert the JSON to a map of show IDs to show names
    const showMap = new Map<string, string>();
    showsSchema.parse(await fetched.json()).forEach((show) => {
      showMap.set(show.showID, show.showDetails.showName);
    });

    return res.status(200).json({ shows: Array.from(showMap) });
  } catch (_err) {
    return res.status(500).json({ message: _err });
  }
}
