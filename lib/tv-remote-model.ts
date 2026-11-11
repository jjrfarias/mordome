import { z } from "zod";

export const remoteControlSchema = z.object({
  version: z.number().int().nonnegative().default(0),
  navigationVersion: z.number().int().nonnegative().default(0),
  itemId: z.string().max(100).nullable().default(null),
  playing: z.boolean().default(true),
  muted: z.boolean().nullable().default(null),
  volume: z.number().min(0).max(1).default(1),
});
export const playbackReportSchema = z.object({
  itemId: z.string().max(100).nullable(),
  playing: z.boolean(), muted: z.boolean(), volume: z.number().min(0).max(1),
  position: z.number().min(0).max(86400),
  appliedVersion: z.number().int().nonnegative(),
  navigationVersion: z.number().int().nonnegative(),
  audioBlocked: z.boolean(),
}).strict();
export const remoteActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("play"), value: z.boolean() }).strict(),
  z.object({ action: z.literal("mute"), value: z.boolean() }).strict(),
  z.object({ action: z.literal("volume"), value: z.number().min(0).max(1) }).strict(),
  z.object({ action: z.literal("next") }).strict(),
  z.object({ action: z.literal("previous") }).strict(),
]);
export type TvRemoteControl = z.infer<typeof remoteControlSchema>;
export type TvPlaybackReport = z.infer<typeof playbackReportSchema>;
export type TvRemoteAction = z.infer<typeof remoteActionSchema>;
export type TvRemoteStatus = { control: TvRemoteControl; report: TvPlaybackReport | null; reportedAt: string | null };
export function readRemoteControl(value: unknown): TvRemoteControl {
  return remoteControlSchema.safeParse(value).data ?? remoteControlSchema.parse({});
}
export function nextRemoteControl(control: TvRemoteControl, action: TvRemoteAction, itemIds: string[], report: TvPlaybackReport | null): TvRemoteControl {
  const next = { ...control, version: control.version + 1 };
  if (action.action === "play") next.playing = action.value;
  if (action.action === "mute") next.muted = action.value;
  if (action.action === "volume") { next.volume = action.value; next.muted = action.value === 0; }
  if (action.action === "next" || action.action === "previous") {
    // Multiple clicks before the device acknowledges must advance from the pending target.
    const current = control.navigationVersion > (report?.navigationVersion ?? 0) ? control.itemId : report?.itemId;
    const index = itemIds.indexOf(current || "");
    next.itemId = itemIds.length ? itemIds[(Math.max(0, index) + (action.action === "next" ? 1 : -1) + itemIds.length) % itemIds.length] : null;
    next.navigationVersion = next.version;
  }
  return next;
}
