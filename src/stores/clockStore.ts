/**
 * Clock formatting always follows the phone's own settings: no in-app toggle.
 */
export function deviceUses24Hour() {
  try {
    const opts = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
    if (typeof opts.hour12 === "boolean") return !opts.hour12;
    return opts.hourCycle === "h23" || opts.hourCycle === "h24";
  } catch {
    return false;
  }
}

/** The device timezone, e.g. "Europe/Paris". */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** True when times should be rendered as 24-hour. */
export function is24Hour() {
  return deviceUses24Hour();
}
