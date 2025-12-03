import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";

// USERS TABLE
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  username: text("username").notNull(),
  email: text("email").notNull(),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow(),
});

// POSTS TABLE
export const posts = pgTable("posts", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  content: text("content"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// VIDEOS TABLE
export const videos = pgTable("videos", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// LOCATIONS TABLE
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  lat: text("lat"),
  lng: text("lng"),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow(),
});

// LIKES TABLE
export const likes = pgTable("likes", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  postId: varchar("post_id"),
  videoId: varchar("video_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// COMMENTS TABLE
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  postId: varchar("post_id"),
  videoId: varchar("video_id"),
  text: text("text"),
  createdAt: timestamp("created_at").defaultNow(),
});
