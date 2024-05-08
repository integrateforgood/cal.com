import { useEffect, useState } from "react";
import { Controller } from "react-hook-form";
import { z } from "zod";

import { useAppContextWithSchema } from "@calcom/app-store/EventTypeAppContext";
import AppCard from "@calcom/app-store/_components/AppCard";
import useIsAppEnabled from "@calcom/app-store/_utils/useIsAppEnabled";
import type { EventTypeAppCardComponent } from "@calcom/app-store/types";
import { Alert, SelectField, showToast } from "@calcom/ui";

import { metadata } from "../_metadata";
import type { appDataSchema } from "../zod";

const EventTypeAppCard: EventTypeAppCardComponent = function EventTypeAppCard({ app, eventType }) {
  const { getAppData, setAppData, disabled } = useAppContextWithSchema<typeof appDataSchema>();
  const showID = getAppData("showID");
  const { enabled, updateEnabled } = useIsAppEnabled(app);
  const [showOptions, setShowOptions] = useState<Array<{ value: string; label: string }>>();

  // Check if this is a team event type
  const isTeamEventType = Boolean(eventType.team);

  // If this is a team event type, we need to grab the teamId from app.credentialOwner
  const teamId = isTeamEventType ? app.credentialOwner?.teamId : undefined;

  // Fetch the shows from Squadcast
  useEffect(() => {
    fetch(`/api/integrations/${metadata.slug}/shows${teamId ? `?teamId=${teamId}` : ""}`)
      .then((res) => res.json() as unknown)
      .then((data) =>
        z
          .object({
            shows: z.array(z.tuple([z.string(), z.string()])),
          })
          .parse(data)
      )
      .then(({ shows }) => {
        const options = shows.map(([value, label]) => ({ value, label }));
        setShowOptions(options);
      });
  }, [teamId]);

  return (
    <AppCard
      app={app}
      switchOnClick={(e) => {
        updateEnabled(e);
      }}
      switchChecked={enabled}
      teamId={eventType.team?.id || undefined}>
      <div className="flex flex-col gap-4 pt-4">
        <Alert
          severity="neutral"
          message="If you don't have SquadCast specified as a location for this event
            type, enabling this app will do nothing. This app is only necessary to associate sessions to a
            show. You can safely disable the app to have sessions scheduled to your account's default
            show (this is usually the first one in the list)."
        />

        {showOptions ? (
          <Controller
            name="selectShow"
            render={({ field: { value, onChange } }) => (
              <SelectField
                containerClassName="mb-0"
                label="Select Show"
                onChange={(option) => {
                  onChange(() => {
                    if (option && option.value) {
                      setAppData("showID", option.value);
                    } else {
                      showToast("We experienced an error trying to select that show.", "error");
                    }
                  });
                }}
                value={showOptions.find((opt) => opt.value === value)}
                options={showOptions}
                defaultValue={showOptions.find((opt) => opt.value === showID)}
                isDisabled={disabled}
              />
            )}
          />
        ) : (
          <SelectField
            containerClassName="mb-0"
            label="Select Show"
            placeholder={showOptions ? "Select Show..." : "Fetching shows..."}
            isDisabled={true}
          />
        )}
      </div>
    </AppCard>
  );
};

export default EventTypeAppCard;
