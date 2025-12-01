import { db } from "./db";
import { users, posts, videos, locations, likes, comments, follows } from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  // Sample users will be created automatically when they log in via Replit Auth
  // We'll just log a message
  console.log("Note: Users will be created automatically upon login via Replit Auth");
  console.log("Database seeding complete!");
}

seed().catch(console.error);
