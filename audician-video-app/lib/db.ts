/**
 * In-memory store — swap for a real DB (Postgres, MongoDB, etc.) in production.
 * Data persists only for the lifetime of the Node process.
 */
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export type SubscriptionTier = 'free' | 'basic' | 'professional' | 'enterprise';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
  subscription: SubscriptionTier;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  videosUsedThisMonth: number;
  monthResetAt: string;
}

export interface Video {
  id: string;
  userId: string;
  prompt: string;
  operationName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  category: string;
}

const users = new Map<string, User>();
const videosByUser = new Map<string, Video[]>();

export const db = {
  users: {
    findByEmail(email: string): User | undefined {
      for (const u of users.values()) {
        if (u.email.toLowerCase() === email.toLowerCase()) return u;
      }
    },
    findById(id: string): User | undefined {
      return users.get(id);
    },
    create(data: Omit<User, 'id' | 'createdAt' | 'videosUsedThisMonth' | 'monthResetAt'>): User {
      const user: User = {
        ...data,
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        videosUsedThisMonth: 0,
        monthResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      };
      users.set(user.id, user);
      return user;
    },
    update(id: string, data: Partial<User>): User | undefined {
      const user = users.get(id);
      if (!user) return undefined;
      const updated = { ...user, ...data };
      users.set(id, updated);
      return updated;
    },
    updateByStripeCustomerId(customerId: string, data: Partial<User>): void {
      for (const [id, user] of users.entries()) {
        if (user.stripeCustomerId === customerId) {
          users.set(id, { ...user, ...data });
          break;
        }
      }
    },
  },

  videos: {
    findById(id: string): Video | undefined {
      for (const vids of videosByUser.values()) {
        const v = vids.find(v => v.id === id);
        if (v) return v;
      }
    },
    findByUserId(userId: string): Video[] {
      return (videosByUser.get(userId) ?? []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },
    findByOperationName(operationName: string): Video | undefined {
      for (const vids of videosByUser.values()) {
        const v = vids.find(v => v.operationName === operationName);
        if (v) return v;
      }
    },
    create(data: Omit<Video, 'id' | 'createdAt'>): Video {
      const video: Video = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
      const list = videosByUser.get(data.userId) ?? [];
      list.push(video);
      videosByUser.set(data.userId, list);
      return video;
    },
    update(id: string, data: Partial<Video>): Video | undefined {
      for (const [userId, vids] of videosByUser.entries()) {
        const idx = vids.findIndex(v => v.id === id);
        if (idx !== -1) {
          vids[idx] = { ...vids[idx], ...data };
          videosByUser.set(userId, vids);
          return vids[idx];
        }
      }
    },
  },
};

export const PLAN_LIMITS: Record<SubscriptionTier, { videosPerMonth: number; maxDuration: number; resolution: string; label: string }> = {
  free:         { videosPerMonth: 2,         maxDuration: 5,  resolution: '720p',  label: 'Free' },
  basic:        { videosPerMonth: 15,         maxDuration: 5,  resolution: '720p',  label: 'Basic' },
  professional: { videosPerMonth: 60,         maxDuration: 8,  resolution: '1080p', label: 'Professional' },
  enterprise:   { videosPerMonth: 9999,       maxDuration: 8,  resolution: '4K',    label: 'Enterprise' },
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
