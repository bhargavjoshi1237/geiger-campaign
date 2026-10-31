// Disposable / temporary inbox domains (config). Addresses here are flagged risky: they accept mail but
// are abandoned within hours, so they inflate lists and drag engagement down. Extend as needed.

export const DISPOSABLE_DOMAINS = [
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "anonbox.net",
  "burnermail.io", "byom.de", "chacuo.net", "crazymailing.com", "discard.email", "discardmail.com",
  "disposable.email", "disposableemailaddresses.com", "dispostable.com", "dropmail.me", "emailfake.com",
  "emailondeck.com", "emailtemporanea.com", "emltmp.com", "fakeinbox.com", "fakemail.net", "fakemailgenerator.com",
  "fexbox.org", "filzmail.com", "getairmail.com", "getnada.com", "guerrillamail.biz", "guerrillamail.com",
  "guerrillamail.de", "guerrillamail.info", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "harakirimail.com", "hidemail.de", "incognitomail.org", "inboxbear.com", "inboxkitten.com", "jetable.org",
  "kasmail.com", "linshiyouxiang.net", "mail-temp.com", "mail.tm", "mail7.io", "mailcatch.com", "maildrop.cc",
  "mailinator.com", "mailinator.net", "mailinator2.com", "mailnesia.com", "mailnull.com", "mailpoof.com",
  "mailsac.com", "mailslurp.com", "mailtemp.net", "mintemail.com", "mohmal.com", "moakt.com", "mt2015.com",
  "my10minutemail.com", "mytemp.email", "mytrashmail.com", "nada.email", "nowmymail.com", "nwytg.net",
  "onetimeemail.net", "owlymail.com", "pokemail.net", "proxymail.eu", "rcpt.at", "sharklasers.com",
  "smailpro.com", "spam4.me", "spamavert.com", "spambog.com", "spambox.us", "spamgourmet.com", "spamex.com",
  "spamfree24.org", "spamhole.com", "spaml.de", "spammotel.com", "tafmail.com", "temp-mail.io", "temp-mail.org",
  "tempail.com", "tempinbox.com", "tempmail.com", "tempmail.de", "tempmail.net", "tempmail.plus", "tempmailo.com",
  "tempr.email", "temporary-mail.net", "temporaryemail.net", "temporaryinbox.com", "thankyou2010.com",
  "throwam.com", "throwawaymail.com", "tmail.ws", "tmailor.com", "tmpmail.net", "tmpmail.org", "trash-mail.com",
  "trashmail.com", "trashmail.de", "trashmail.io", "trashmail.me", "trashmail.net", "trbvm.com", "tyldd.com",
  "wegwerfemail.de", "wegwerfmail.de", "wegwerfmail.net", "yopmail.com", "yopmail.fr", "yopmail.net",
  "zetmail.com", "zippymail.info",
];

export const DISPOSABLE_SET = new Set(DISPOSABLE_DOMAINS);
