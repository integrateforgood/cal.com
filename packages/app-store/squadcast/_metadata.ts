import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  linkType: "dynamic",
  name: "SquadCast",
  description: _package.description,
  type: "squadcast_video",
  categories: ["conferencing"],
  variant: "conferencing",
  logo: "icon.svg",
  publisher: "Nick Welsh",
  url: "https://squadcast.fm",
  category: "conferencing",
  slug: "squadcast",
  isGlobal: false,
  email: "tech@integrateforgood.org",
  extendsFeature: "EventType",
  appData: {
    location: {
      default: false,
      linkType: "dynamic",
      type: "integrations:squadcast_video",
      label: "SquadCast",
    },
  },
  concurrentMeetings: true,
} as AppMeta;

export default metadata;
