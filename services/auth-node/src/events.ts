// Cross-service events over Redis pub/sub (ADR-006). The data service listens
// for `user.deleted` to purge that workspace's datasets.

import { Redis } from "ioredis"

export const USER_DELETED = "events:user.deleted"

export type UserDeletedEvent = { userId: string; workspaceId: string; at: string }

export type EventPublisher = {
  publish(channel: string, payload: unknown): Promise<void>
  close(): Promise<void>
}

export function createRedisPublisher(url: string): EventPublisher {
  const redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false })
  return {
    async publish(channel, payload) {
      await redis.publish(channel, JSON.stringify(payload))
    },
    async close() {
      await redis.quit()
    },
  }
}

/** Used when REDIS_URL is unset (tests, minimal local runs). */
export function createMemoryPublisher() {
  const published: { channel: string; payload: unknown }[] = []
  const publisher: EventPublisher & { published: typeof published } = {
    published,
    async publish(channel, payload) {
      published.push({ channel, payload })
    },
    async close() {},
  }
  return publisher
}
