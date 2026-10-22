import mongoose from "mongoose";
import dns from "node:dns";

// Configure public DNS resolvers to prevent Windows / ISP querySrv ECONNREFUSED on MongoDB Atlas
const configureDns = () => {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {
    // Ignore in restricted environments
  }
};

configureDns();

// Known Atlas shard hosts for cluster0.xuuzivc.mongodb.net
const CLUSTER0_SHARDS = [
  "ac-kykaxbm-shard-00-00.xuuzivc.mongodb.net:27017",
  "ac-kykaxbm-shard-00-01.xuuzivc.mongodb.net:27017",
  "ac-kykaxbm-shard-00-02.xuuzivc.mongodb.net:27017",
].join(",");

/**
 * Converts a mongodb+srv:// URI to a direct replica-set mongodb:// URI
 * bypassing DNS SRV records entirely to prevent ECONNREFUSED on networks with broken SRV lookups.
 */
async function getDirectConnectionUri(srvUri: string): Promise<string> {
  if (!srvUri.startsWith("mongodb+srv://")) return srvUri;

  try {
    // Extract credentials and options
    const url = new URL(srvUri.replace("mongodb+srv://", "http://"));
    const auth =
      url.username && url.password
        ? `${encodeURIComponent(decodeURIComponent(url.username))}:${encodeURIComponent(decodeURIComponent(url.password))}@`
        : "";
    const hostname = url.hostname;
    const dbName = url.pathname.replace(/^\//, "");

    // 1. If it's this project's known cluster, use direct shard hosts immediately
    if (hostname.includes("cluster0.xuuzivc.mongodb.net")) {
      return `mongodb://${auth}${CLUSTER0_SHARDS}/${dbName}?ssl=true&authSource=admin&replicaSet=atlas-d5ha42-shard-0&appName=Cluster0`;
    }

    // 2. Otherwise dynamically resolve SRV using public DNS
    configureDns();
    const srvRecords = await dns.promises.resolveSrv(`_mongodb._tcp.${hostname}`);
    if (srvRecords && srvRecords.length > 0) {
      const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(",");
      let extraParams = "";
      try {
        const txtRecords = await dns.promises.resolveTxt(hostname);
        if (txtRecords && txtRecords.length > 0) {
          extraParams = "&" + txtRecords.flat().join("&");
        }
      } catch {
        // TXT record optional
      }
      return `mongodb://${auth}${hosts}/${dbName}?ssl=true&authSource=admin${extraParams}`;
    }
  } catch {
    // Fall back to original URI if conversion fails
  }

  return srvUri;
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

  configureDns();

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    };

    cached.promise = (async () => {
      try {
        // Attempt normal connect first
        return await mongoose.connect(MONGODB_URI, opts);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isSrvError =
          errMsg.includes("querySrv") ||
          errMsg.includes("ECONNREFUSED") ||
          errMsg.includes("ENOTFOUND");

        if (isSrvError && MONGODB_URI.startsWith("mongodb+srv://")) {
          console.warn(
            "MongoDB SRV DNS query refused by local network. Switching automatically to direct replica set...",
          );
          const directUri = await getDirectConnectionUri(MONGODB_URI);
          return await mongoose.connect(directUri, opts);
        }
        throw err;
      }
    })();
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
