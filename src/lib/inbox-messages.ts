export function visibleInboxMessages<T extends { id: string }>(messages: T[], hasEmail: boolean): T[] {
  return messages.filter((message) => !hasEmail || message.id !== "guest-email").slice(0, 3);
}

export function unreadInboxCount(messages: { id: string }[], seen: string[]): number {
  return messages.filter((message) => !seen.includes(message.id)).length;
}