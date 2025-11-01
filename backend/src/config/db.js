"use strict";

import mongoose from "mongoose";

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");

  mongoose.set("strictQuery", true);

  // Attach listeners BEFORE connecting
  mongoose.connection.on("error", (e) => console.error("[Mongo] error", e));
  mongoose.connection.on("disconnected", () => console.warn("[Mongo] disconnected"));
  mongoose.connection.on("reconnected", () => console.log("[Mongo] reconnected"));

  // Connect (resolves only when ready)
  await mongoose.connect(uri, {
    autoIndex: process.env.NODE_ENV !== "production"
  });

  // Success — no console.log here (banner prints once in server.js)
}
