import type {
  Book as PrismaBook,
  Bookmark as PrismaBookmark,
  Chapter as PrismaChapter,
  DeviceSource as PrismaDeviceSource,
  ListeningDay as PrismaListeningDay,
  Progress as PrismaProgress,
  ModerationAction as PrismaModerationAction,
  Profile as PrismaProfile,
  Quote as PrismaQuote,
  SharedWork as PrismaSharedWork,
  UserSettings as PrismaUserSettings,
  SourceKind,
} from '@prisma/client'

export type { SourceKind }

/**
 * Prisma types a `timestamptz` column as `Date`, because Prisma Client would
 * deserialize it that way. We do not use Prisma Client — supabase-js goes
 * through PostgREST, which hands back ISO-8601 *strings*. Mapping Date to
 * string here keeps the generated types describing what actually arrives.
 *
 * `T[K]` is an indexed access rather than a naked type parameter, so the
 * conditional does not distribute and `Date | null` is matched as a whole.
 */
type Wire<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K]
}

// ---------------------------------------------------------------------------
// Row types — generated from prisma/schema.prisma, never hand-edited.
// Run `npm run db:generate` after changing the schema.
// ---------------------------------------------------------------------------

export type Book = Wire<PrismaBook>
export type Chapter = Wire<PrismaChapter>
export type Progress = Wire<PrismaProgress>
export type Bookmark = Wire<PrismaBookmark>
export type DeviceSource = Wire<PrismaDeviceSource>
export type UserSettings = Wire<PrismaUserSettings>
export type ListeningDay = Wire<PrismaListeningDay>
export type Quote = Wire<PrismaQuote>
export type Profile = Wire<PrismaProfile>
export type SharedWork = Wire<PrismaSharedWork>
export type ModerationAction = Wire<PrismaModerationAction>

/**
 * A quote as the world sees it, which is a strictly smaller thing than a
 * Quote. This mirrors the `shared_quotes` view rather than the table: the
 * note and the owner are not omitted here by convention, they are absent from
 * the view itself and cannot be asked for.
 */
export interface SharedQuote {
  id: string
  work_key: string
  text: string
  author: string | null
  quoted_author: string | null
  created_at: string
}

/** A chapter as produced by scanning, before it has ids or an owner. */
export type NewChapter = Omit<Chapter, 'id' | 'book_id' | 'user_id'>

// ---------------------------------------------------------------------------
// Scan-time shapes. These never touch the database, so they stay hand-written.
// ---------------------------------------------------------------------------

export interface EmbeddedChapter {
  title: string
  startSec: number
  endSec: number | null
}

export interface ScannedTrack {
  /** Path relative to the picked folder. */
  fileName: string
  /** ID3/MP4 title if present, else the filename without extension. */
  title: string
  trackNo: number | null
  diskNo: number | null
  durationSec: number
  album: string | null
  artist: string | null
  /** Embedded chapter markers, normalized to seconds. Null when the file has none. */
  chapters: EmbeddedChapter[] | null
  coverBlob: Blob | null
  sizeBytes: number
}

export interface ScannedBook {
  title: string
  author: string | null
  sourceKind: SourceKind
  folderLabel: string
  totalDurationSec: number
  coverBlob: Blob | null
  chapters: NewChapter[]
}

export interface ScanProgress {
  phase: 'listing' | 'reading-tags' | 'done'
  filesFound: number
  filesProcessed: number
  currentFile: string | null
}
