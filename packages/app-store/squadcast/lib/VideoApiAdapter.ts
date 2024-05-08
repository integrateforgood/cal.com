import { z } from "zod";

import dayjs from "@calcom/dayjs";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import getEventTypeById from "@calcom/lib/event-types/getEventTypeById";
import prisma from "@calcom/prisma";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import { getEventTypeAppData } from "../../_utils/getEventTypeAppData";
import { metadata } from "../_metadata";

const empty = {
  type: "",
  id: "",
  password: "",
  url: "",
};

async function getShowId(eventData: CalendarEvent) {
  if (!eventData || !eventData.eventTypeId || !eventData.organizer.id) return;

  const eventType = await getEventTypeById({
    currentOrganizationId: null,
    eventTypeId: eventData.eventTypeId,
    userId: eventData.organizer.id,
    prisma,
    isUserOrganizationAdmin: false,
  });

  const appData = getEventTypeAppData(eventType.eventType, "squadcast");
  if (!appData) return;

  return appData.showID;
}

function getApiKey(credential: CredentialPayload) {
  if (!credential.key) return;

  const { apiKey } = z
    .object({
      apiKey: z.string(),
    })
    .parse(credential.key);

  return symmetricDecrypt(apiKey, process.env.CALENDSO_ENCRYPTION_KEY || "");
}

// Helper function to create a query string from an object.
// URLSearchParams() seems to throw errors, so this is a workaround.
function createQueryString(params: Record<string, string | string[]>): string {
  const queryString = Object.entries(params)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((val) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`).join("&");
      } else {
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      }
    })
    .join("&");
  return queryString;
}

async function getQueryString(eventData: CalendarEvent, action: "create" | "update") {
  // Create the data object for the Squadcast API
  // The API is finicky with Timezones depending on the endpoint, so we will adjust accordingly.
  const tz = action === "create" ? eventData.organizer.timeZone : "UTC";

  const createStageAndViewers = () => {
    const guests = eventData.responses?.guests.value as string[];
    const allAttendees = eventData.attendees.map((attendee) => attendee.email);
    const attendee = allAttendees.filter((attendee) => !guests.includes(attendee));
    const organizer = eventData.organizer.email;
    const team = eventData.team?.members.map((member) => member.email);
    const everyone = team ? [organizer, ...attendee, ...team] : [organizer, ...attendee];

    if (everyone.length <= 10)
      return {
        stage: everyone,
        viewer: [...guests],
      };
    else {
      const stage = everyone.slice(0, 10);
      const viewer = everyone.slice(10);
      return {
        stage,
        viewer: [...viewer, ...guests],
      };
    }
  };

  const { stage, viewer } = createStageAndViewers();

  const data: Record<string, string | string[]> = {
    sessionTitle: eventData.title,
    date: dayjs(eventData.startTime).utc().tz(tz).format("YYYY-MM-DD"),
    startTime: new Date(eventData.startTime)
      .toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: tz,
      })
      .substring(0, 8),
    endTime: new Date(eventData.endTime)
      .toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: tz,
      })
      .substring(0, 8),
    timeZone: eventData.organizer.timeZone,
    stage,
    viewer,
  };

  const showId = await getShowId(eventData);
  if (showId) data.showID = showId;

  return createQueryString(data);
}

const SquadcastVideoApiAdapter = (credential: CredentialPayload): VideoApiAdapter => {
  return {
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (eventData: CalendarEvent): Promise<VideoCallData> => {
      const response = await fetch("https://api.squadcast.fm/v2/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getApiKey(credential)}`,
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: await getQueryString(eventData, "create"),
      });

      if (response.status !== 200) return Promise.resolve(empty);

      const newSession = (await response.json()) as unknown;
      const { sessionID, showID } = z
        .object({
          sessionID: z.string(),
          showID: z.string(),
        })
        .parse(newSession);

      return Promise.resolve({
        id: sessionID,
        password: "",
        url: `https://app.squadcast.fm/studio/${showID}/session/${sessionID}`,
        type: metadata.type,
      });
    },
    deleteMeeting: async (uid: string): Promise<void> => {
      const apiKey = getApiKey(credential);
      // We only want to delete the session on Squadcast if we haven't recorded anything.
      const canWeDelete = await fetch(`https://api.squadcast.fm/v2/sessions/${uid}/recordings`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      })
        .then((res) => res.json() as unknown)
        .then((data) => {
          // We will look at the first child of the array to determine if we can delete the session.
          // https://developers.squadcast.fm/reference/get_v2-sessions-id-recordings
          const recordings = z
            .array(
              z
                .object({
                  status: z.string(),
                })
                .or(z.object({ recordingID: z.string() }))
            )
            .parse(data);

          if (recordings[0].hasOwnProperty("recordingID")) {
            return false;
          }

          return true;
        });

      if (!canWeDelete) return Promise.resolve();

      await fetch(`https://api.squadcast.fm/v2/sessions/${uid}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });

      Promise.resolve();
    },
    updateMeeting: async (bookingRef: PartialReference, eventData: CalendarEvent): Promise<VideoCallData> => {
      if (!bookingRef.meetingId) return Promise.resolve(empty);

      await fetch(`https://api.squadcast.fm/v2/sessions/${bookingRef.meetingId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getApiKey(credential)}`,
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: await getQueryString(eventData, "update"),
      });

      return Promise.resolve({
        id: bookingRef.meetingId as string,
        password: bookingRef.meetingPassword as string,
        url: bookingRef.meetingUrl as string,
        type: metadata.type,
      });
    },
  };
};

export default SquadcastVideoApiAdapter;
