import { Redis } from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Parse REDIS_URL into connection options.
// BullMQ uses its own bundled ioredis internally — passing options (not an instance)
// avoids the dual-ioredis type conflict and is the officially recommended pattern.
function parseRedisOptions() {
  const isTLS = redisUrl.startsWith('rediss://');
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || (isTLS ? 6380 : 6379),
      password: url.password ? decodeURIComponent(url.password) : (process.env.REDIS_PASSWORD || undefined),
      username: url.username ? decodeURIComponent(url.username) : (process.env.REDIS_USERNAME || undefined),
      maxRetriesPerRequest: null as null, // required by BullMQ
      enableReadyCheck: false,            // required for Upstash
      ...(isTLS ? { tls: {} } : {}),
    };
  } catch (error) {
    console.warn('[Redis] Failed to parse REDIS_URL using URL parser, attempting fallback parsing.', error);
    // Simple fallback parsing for redis://host:port or redis://:password@host:port
    const cleanedUrl = redisUrl.replace(/^(redis|rediss):\/\//, '');
    const atIndex = cleanedUrl.lastIndexOf('@');
    
    let auth = '';
    let hostPort = cleanedUrl;
    if (atIndex !== -1) {
      auth = cleanedUrl.substring(0, atIndex);
      hostPort = cleanedUrl.substring(atIndex + 1);
    }
    
    const [host, portStr] = hostPort.split(':');
    const port = parseInt(portStr) || (isTLS ? 6380 : 6379);
    
    let username = undefined;
    let password = process.env.REDIS_PASSWORD || undefined;
    
    if (auth) {
      const colonIndex = auth.indexOf(':');
      if (colonIndex !== -1) {
        username = auth.substring(0, colonIndex) || undefined;
        password = auth.substring(colonIndex + 1) || password;
      } else {
        username = auth || undefined;
      }
    }
    
    return {
      host,
      port,
      username: username ? decodeURIComponent(username) : undefined,
      password: password ? decodeURIComponent(password) : undefined,
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
      ...(isTLS ? { tls: {} } : {}),
    };
  }
}

// Export options object — used by BullMQ Queue and Worker
export const bullMQRedisOptions = parseRedisOptions();

// Separate ioredis instance for non-BullMQ use (health check, etc.)
export const redisConnection = new Redis({
  host: bullMQRedisOptions.host,
  port: bullMQRedisOptions.port,
  username: bullMQRedisOptions.username,
  password: bullMQRedisOptions.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {}),
});

redisConnection.on('connect', () => console.log('[Redis] Connected'));
redisConnection.on('error', (err) => console.error('[Redis] Error:', err.message));

