import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Toaster } from "react-hot-toast";

import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert, Button, Form, PasswordField } from "@calcom/ui";

import { metadata } from "../../_metadata";

export default function SquadcastVideoSetup() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("teamId");
  const form = useForm({
    defaultValues: {
      apiKey: "",
      teamId,
    },
  });

  const [errorMessage, setErrorMessage] = useState("");

  return (
    <div className="bg-emphasis flex h-screen dark:bg-inherit">
      <div className="bg-default dark:bg-muted border-subtle m-auto rounded p-5 dark:border md:w-[560px] md:p-10">
        <div className="flex flex-col space-y-5 md:flex-row md:space-x-5 md:space-y-0">
          <div>
            {/* eslint-disable @next/next/no-img-element */}
            <img
              src={`/api/app-store/${metadata.slug}/icon.svg`}
              alt={metadata.name}
              className="h-12 w-12 max-w-2xl"
            />
          </div>
          <div>
            <h1 className="text-default dark:text-emphasis mb-3 font-semibold">
              {/*TODO: Add translation*/}
              {/*{{t("connect_squadcast")}}*/}
              Connect to SquadCast
            </h1>

            <div className="mt-1 text-sm">
              {t("generate_api_key_description", { appName: APP_NAME })}{" "}
              <a
                className="font-bold hover:underline"
                href="https://app.squadcast.fm/account/developers"
                target="_blank"
                rel="noopener noreferrer">
                https://app.squadcast.fm/account/developers
              </a>
              . {t("credentials_stored_encrypted")}
            </div>
            <div className="my-2 mt-4">
              <Form
                form={form}
                handleSubmit={async (values) => {
                  setErrorMessage("");
                  const res = await fetch(`/api/integrations/${metadata.slug}/add`, {
                    method: "POST",
                    body: JSON.stringify(values),
                    headers: {
                      "Content-Type": "application/json",
                    },
                  });
                  const json = await res.json();
                  if (!res.ok) {
                    setErrorMessage(json?.message || t("something_went_wrong"));
                  } else {
                    router.push(json.url);
                  }
                }}>
                <fieldset className="space-y-4" disabled={form.formState.isSubmitting}>
                  <PasswordField
                    required
                    {...form.register("apiKey")}
                    label={`SquadCast ${t("api_key")}`}
                    placeholder="•••••••••••••"
                    autoComplete="off"
                  />
                </fieldset>

                {errorMessage && <Alert severity="error" title={errorMessage} className="my-4" />}
                <div className="mt-5 justify-end space-x-2 rtl:space-x-reverse sm:mt-4 sm:flex">
                  <Button type="button" color="secondary" onClick={() => router.back()}>
                    {t("cancel")}
                  </Button>
                  <Button type="submit" loading={form.formState.isSubmitting}>
                    {t("save")}
                  </Button>
                </div>
              </Form>
            </div>
          </div>
        </div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
