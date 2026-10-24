import { describe, expect, it } from "vitest";
import { unreadInboxCount, visibleInboxMessages } from "./inbox-messages";

const messages = [{ id: "guest-subscribe" }, { id: "guest-email" }, { id: "bird-message" }];

describe("inbox visibility and unread count", () => {
  it("hides only the email prompt after email entry", () => {
    expect(visibleInboxMessages(messages, true)).toEqual([{ id: "guest-subscribe" }, { id: "bird-message" }]);
  });
  it("keeps both prompts before email entry", () => {
    expect(visibleInboxMessages(messages, false)).toEqual(messages);
  });
  it("keeps viewed messages available without counting them as unread", () => {
    const visible = visibleInboxMessages(messages, true);
    expect(visible).toHaveLength(2);
    expect(unreadInboxCount(visible, ["guest-subscribe", "bird-message"])).toBe(0);
    expect(unreadInboxCount(visible, ["guest-subscribe"])).toBe(1);
  });
});