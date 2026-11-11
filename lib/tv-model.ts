import { TV_MIME_TYPES } from "./tv-upload.ts";

export { MAX_TV_UPLOAD_BYTES as MAX_UPLOAD_BYTES, matchesTvFileSignature as matchesFileSignature, parseTvByteRange as parseByteRange } from "./tv-upload.ts";

export type TvPlaylistItem = {
  id: string;
  source: "instagram" | "upload";
  type: "IMAGE" | "VIDEO";
  url: string;
  thumbnailUrl?: string;
  name: string;
  createdAt: string;
  expiresAt?: string | null;
  enabled: boolean;
};

export type TvSettings = {
  imageDuration: number;
  fit: "contain" | "cover";
  source: "all" | "instagram" | "upload";
  muted: boolean;
};

export type TvState = {
  establishment: { id: string; name: string };
  branding: { name: string; slogan: string; instagramHandle: string; logoUrl: string | null; accentColor: string };
  settings: TvSettings;
  instagram: { connected: boolean; username: string | null; error: string | null; lastSync: string | null; configured: boolean };
  storage: { configured: boolean };
  items: TvPlaylistItem[];
  displays?: { id: string; name: string; createdAt: string; lastSeenAt: string | null }[];
};

export const TV_DEFAULT_SETTINGS: TvSettings = { imageDuration: 8, fit: "contain", source: "all", muted: true };
export const ACCEPTED_TYPES = new Set<string>(TV_MIME_TYPES);

// Only explicit, safe messages may cross the API boundary; upstream exceptions never do.
export class TvError extends Error {
  status: number;
  extra: Record<string, unknown>;

  constructor(message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "TvError";
    this.status = status;
    this.extra = extra;
  }
}

export function activeStories(items: TvPlaylistItem[], now = Date.now()): TvPlaylistItem[] {
  return items.filter(item => item.source === "instagram" && !!item.expiresAt && Date.parse(item.expiresAt) > now);
}
