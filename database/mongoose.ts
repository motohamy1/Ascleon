import mongoose from "mongoose";
import dns from "node:dns";

// Fix Node.js on Windows querySrv ECONNREFUSED when resolving MongoDB Atlas SRV records
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Ignore in restricted environments
}

declare global {
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
}

const cached =
  global.mongooseCache ||
  (global.mongooseCache = { conn: null, promise: null });

export const connectToDatabase = async () => {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI)
    throw new Error("Please define the MONGODB_URI environment variable");

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error(
      "MongoDB connection error. Please make sure MongoDB is running: " +
        (e instanceof Error ? e.message : String(e)),
    );
    throw e;
  }

  console.info("Connected to MongoDB");
  return cached.conn;
};
