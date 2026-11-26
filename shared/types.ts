// Types shared by the server and the web client.

export type Lang = 'fr' | 'ru' | 'es' | 'en';
export type World = Lang;
export type ProfileType = 'student' | 'entrepreneur' | 'employee' | 'medical' | 'legal';
export type ChatCategory = 'city' | 'event' | 'sport' | 'profile' | 'general';
export type Role = 'owner' | 'admin' | 'member';

export const WORLDS: World[] = ['fr', 'en', 'es', 'ru'];
export const PROFILES: ProfileType[] = ['student', 'entrepreneur', 'employee', 'medical', 'legal'];
export const CATEGORIES: ChatCategory[] = ['city', 'event', 'sport', 'profile', 'general'];

export interface UserPublic {
  id: number;
  name: string;
  username: string;
  avatar: string | null;
  bio: string;
  profile: ProfileType | null;
  city: string | null;
  world: World;
  aliyahYear: number | null;
  lastSeen: number;
  online: boolean;
  isSystem: boolean;
}

export interface Me extends UserPublic {
  email: string;
  isAdmin: boolean;
  blocked: number[];
}

export interface Attachment {
  url: string;
  name: string;
  size: number;
  mime: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  width?: number;
  height?: number;
  duration?: number;
  voice?: boolean;
}

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface PollData {
  question: string;
  options: string[];
  multiple: boolean;
  counts: number[];
  voters: number;
  myVotes: number[];
}

export interface EventData {
  id: number;
  chatId: number;
  chatName: string;
  chatEmoji: string;
  inviteCode: string | null;
  world: World;
  title: string;
  description: string;
  location: string;
  startsAt: number;
  endsAt: number | null;
  going: number;
  maybe: number;
  myStatus: 'going' | 'maybe' | 'no' | null;
  createdBy: number;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'poll' | 'event' | 'system';

export interface SystemInfo {
  kind: 'created' | 'pinned' | 'welcome' | 'renamed';
  actor?: string;
  value?: string;
}

export interface MessageRef {
  id: number;
  userId: number;
  userName: string;
  type: MessageType;
  text: string;
  deleted: boolean;
}

export interface Message {
  id: number;
  chatId: number;
  userId: number;
  user: { id: number; name: string; username: string; avatar: string | null; isSystem: boolean };
  type: MessageType;
  text: string;
  attachment: Attachment | null;
  replyTo: MessageRef | null;
  forwarded: boolean;
  editedAt: number | null;
  deleted: boolean;
  createdAt: number;
  pinnedAt: number | null;
  reactions: Reaction[];
  starred: boolean;
  mentions: number[];
  poll?: PollData;
  event?: EventData;
  system?: SystemInfo;
}

export interface MessagePreview {
  id: number;
  userId: number;
  userName: string;
  type: MessageType;
  text: string;
  deleted: boolean;
  createdAt: number;
  system?: SystemInfo;
}

export interface Chat {
  id: number;
  type: 'group' | 'dm';
  world: World | null;
  name: string;
  description: string;
  emoji: string;
  avatar: string | null;
  category: ChatCategory;
  city: string | null;
  profile: ProfileType | null;
  communityId: number | null;
  communityName: string | null;
  isAnnouncement: boolean;
  inviteCode: string | null;
  memberCount: number;
  sendPolicy: 'all' | 'admins';
  pinPolicy: 'all' | 'admins';
  createdAt: number;
  lastActivity: number;
  // viewer specific
  isMember: boolean;
  role: Role | null;
  muted: boolean;
  pinned: boolean;
  archived: boolean;
  unread: number;
  lastReadId: number;
  lastMessage: MessagePreview | null;
  // dm only
  peer?: UserPublic;
  peerLastReadId?: number;
}

export interface Community {
  id: number;
  world: World;
  name: string;
  description: string;
  emoji: string;
  avatar: string | null;
  inviteCode: string;
  memberCount: number;
  groupCount: number;
  isMember: boolean;
  role: Role | null;
  groups?: Chat[];
}

export interface Member {
  user: UserPublic;
  role: Role;
  joinedAt: number;
}

export interface Story {
  id: number;
  userId: number;
  type: 'text' | 'image' | 'video';
  text: string;
  bg: string;
  media: Attachment | null;
  createdAt: number;
  expiresAt: number;
  viewed: boolean;
  views: number;
}

export interface StoryGroup {
  user: UserPublic;
  stories: Story[];
  allViewed: boolean;
  latest: number;
}

export interface InvitePreview {
  kind: 'chat' | 'community';
  chat?: Chat;
  community?: Community;
}

export interface Report {
  id: number;
  reporter: { id: number; name: string };
  targetType: 'message' | 'user' | 'chat' | 'story';
  targetId: number;
  reason: string;
  details: string;
  createdAt: number;
  status: 'open' | 'closed';
  excerpt: string;
  chatId: number | null;
}

// ---- realtime payloads (server -> client) ----
export interface MessagePatchEvent {
  chatId: number;
  id: number;
  patch: Partial<Pick<Message, 'text' | 'editedAt' | 'deleted' | 'attachment' | 'pinnedAt' | 'mentions'>>;
}
export interface ReactionEvent {
  chatId: number;
  id: number;
  userId: number;
  emoji: string | null;
  reactions: { emoji: string; count: number }[];
}
export interface PollEvent {
  chatId: number;
  id: number;
  userId: number;
  votes: number[];
  counts: number[];
  voters: number;
}
export interface RsvpEvent {
  chatId: number;
  messageId: number | null;
  eventId: number;
  userId: number;
  status: 'going' | 'maybe' | 'no' | null;
  going: number;
  maybe: number;
}
