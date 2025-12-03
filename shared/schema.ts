import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

/* --------------------------
   DATABASE TABLES
-------------------------- */

// USERS
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  username: text("username").notNull(),
  email: text("email").notNull(),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow(),
});

// POSTS
export const posts = pgTable("posts", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  content: text("content"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// VIDEOS
export const videos = pgTable("videos", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// LOCATIONS
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  lat: text("lat"),
  lng: text("lng"),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow(),
});

// LIKES
export const likes = pgTable("likes", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  postId: varchar("post_id"),
  videoId: varchar("video_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// COMMENTS
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  postId: varchar("post_id"),
  videoId: varchar("video_id"),
  text: text("text"),
  createdAt: timestamp("created_at").defaultNow(),
});

// FOLLOWS
export const follows = pgTable("follows", {
  id: varchar("id").primaryKey(),
  followerId: varchar("follower_id").notNull(),
  followingId: varchar("following_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// SAVES (saved posts / videos)
export const saves = pgTable("saves", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  postId: varchar("post_id"),
  videoId: varchar("video_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

/* --------------------------
   ZOD INSERT SCHEMAS
-------------------------- */

export const insertPostSchema = z.object({
  userId: z.string(),
  content: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const insertVideoSchema = z.object({
  userId: z.string(),
  videoUrl: z.string(),
  thumbnailUrl: z.string().optional(),
});

export const insertLocationSchema = z.object({
  userId: z.string(),
  lat: z.string(),
  lng: z.string(),
  label: z.string().optional(),
});

export const insertCommentSchema = z.object({
  userId: z.string(),
  postId: z.string().optional(),
  videoId: z.string().optional(),
  text: z.string(),
});
