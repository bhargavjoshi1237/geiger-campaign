import * as email from "./email";
import * as sms from "./sms";
import * as whatsapp from "./whatsapp";
import * as push from "./push";
import * as inApp from "./in_app";
import * as instagram from "./instagram";
import * as messenger from "./messenger";
import * as telegram from "./telegram";
import * as tiktok from "./tiktok";
import * as rcs from "./rcs";

// channel -> provider module ({ name, send(ctx) }). Each channel owns its file; this map never changes
// when a provider is implemented.
export const PROVIDERS = {
  email,
  sms,
  whatsapp,
  push,
  in_app: inApp,
  instagram,
  messenger,
  telegram,
  tiktok,
  rcs,
};
