import {
  users,
  posts,
  videos,
  locations,
  likes,
  comments,
  follows,
  saves,
  type User,
  type UpsertUser,
  type Post,
  type InsertPost,
  type Video,
  type InsertVideo,
  type Location,
  type InsertLocation,
  type Like,
  type InsertLike,
  type Comment,
  type InsertComment,
  type Follow,
  type InsertFollow,
  type Save,
  type InsertSave,
  type PostWithDetails,
  type VideoWithDetails,
  type CommentWithUser,
  type LocationWithDetails,
  type UserProfile,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, count } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUserProfile(userId: string, currentUserId?: string): Promise<UserProfile | undefined>;
  updateUserBio(userId: string, bio: string): Promise<User>;
  updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; bio?: string; profileImageUrl?: string }): Promise<User>;

  // Post operations
  createPost(post: InsertPost): Promise<Post>;
  getPost(id: string): Promise<Post | undefined>;
  getUserPosts(userId: string): Promise<Post[]>;
  getFeedPosts(userId: string, limit?: number): Promise<PostWithDetails[]>;
  getPostWithDetails(postId: string, currentUserId?: string): Promise<PostWithDetails | undefined>;
  deletePost(postId: string, userId: string): Promise<boolean>;
  deletePostAdmin(postId: string): Promise<boolean>;

  // Video operations
  createVideo(video: InsertVideo): Promise<Video>;
  getVideo(id: string): Promise<Video | undefined>;
  getUserVideos(userId: string): Promise<Video[]>;
  getFeedVideos(userId: string, limit?: number): Promise<VideoWithDetails[]>;
  getVideoWithDetails(videoId: string, currentUserId?: string): Promise<VideoWithDetails | undefined>;
  deleteVideo(videoId: string, userId: string): Promise<boolean>;
  deleteVideoAdmin(videoId: string): Promise<boolean>;

  // Location operations
  createLocation(location: InsertLocation): Promise<Location>;
  getLocation(id: string): Promise<Location | undefined>;
  getAllLocations(): Promise<LocationWithDetails[]>;
  getUserLocations(userId: string): Promise<Location[]>;
  deleteLocation(locationId: string, userId: string): Promise<boolean>;
  deleteLocationAdmin(locationId: string): Promise<boolean>;

  // Like operations
  likePost(userId: string, postId: string): Promise<Like>;
  unlikePost(userId: string, postId: string): Promise<boolean>;
  likeVideo(userId: string, videoId: string): Promise<Like>;
  unlikeVideo(userId: string, videoId: string): Promise<boolean>;
  isLikedPost(userId: string, postId: string): Promise<boolean>;
  isLikedVideo(userId: string, videoId: string): Promise<boolean>;

  // Comment operations
  createComment(comment: InsertComment): Promise<Comment>;
  getPostComments(postId: string): Promise<CommentWithUser[]>;
  getVideoComments(videoId: string): Promise<CommentWithUser[]>;
  deleteComment(commentId: string, userId: string): Promise<boolean>;
  deleteCommentAdmin(commentId: string): Promise<boolean>;

  // Admin operations - get ALL content for moderation
  getAllPosts(): Promise<PostWithDetails[]>;
  getAllVideos(): Promise<VideoWithDetails[]>;
  getAllComments(): Promise<CommentWithUser[]>;

  // Follow operations
  followUser(followerId: string, followingId: string): Promise<Follow>;
  unfollowUser(followerId: string, followingId: string): Promise<boolean>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;

  // Save operations
  savePost(userId: string, postId: string): Promise<Save>;
  unsavePost(userId: string, postId: string): Promise<boolean>;
  saveVideo(userId: string, videoId: string): Promise<Save>;
  unsaveVideo(userId: string, videoId: string): Promise<boolean>;
  getSavedPosts(userId: string): Promise<PostWithDetails[]>;
  getSavedVideos(userId: string): Promise<VideoWithDetails[]>;
  isSavedPost(userId: string, postId: string): Promise<boolean>;
  isSavedVideo(userId: string, videoId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    if (userData.email) {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(users)
          .set({
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.email, userData.email))
          .returning();
        return updated;
      }
    }

    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: sql`excluded.email`,
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          profileImageUrl: sql`excluded.profile_image_url`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserProfile(userId: string, currentUserId?: string): Promise<UserProfile | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return undefined;

    const [postsCountResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.userId, userId));

    const [followersCountResult] = await db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followingId, userId));

    const [followingCountResult] = await db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followerId, userId));

    let isFollowing = false;
    if (currentUserId && currentUserId !== userId) {
      isFollowing = await this.isFollowing(currentUserId, userId);
    }

    return {
      ...user,
      postsCount: postsCountResult.count,
      followersCount: followersCountResult.count,
      followingCount: followingCountResult.count,
      isFollowing,
    };
  }

  async updateUserBio(userId: string, bio: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ bio, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; bio?: string; profileImageUrl?: string }): Promise<User> {
    const updateData: any = { updatedAt: new Date() };
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.profileImageUrl !== undefined) updateData.profileImageUrl = data.profileImageUrl;

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Post operations
  async createPost(postData: InsertPost): Promise<Post> {
    const [post] = await db.insert(posts).values(postData).returning();
    return post;
  }

  async getPost(id: string): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }

  async getUserPosts(userId: string): Promise<Post[]> {
    return await db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt));
  }

  async getFeedPosts(userId: string, limit: number = 20): Promise<PostWithDetails[]> {
    const feedPosts = await db
      .select({
        post: posts,
        user: users,
        location: locations,
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .leftJoin(locations, eq(posts.locationId, locations.id))
      .orderBy(desc(posts.createdAt))
      .limit(limit);

    const postsWithDetails = await Promise.all(
      feedPosts.map(async ({ post, user, location }) => {
        if (!user) throw new Error("Post has no user");

        const [likesCountResult] = await db
          .select({ count: count() })
          .from(likes)
          .where(eq(likes.postId, post.id));

        const [commentsCountResult] = await db
          .select({ count: count() })
          .from(comments)
          .where(eq(comments.postId, post.id));

        const [userLike] = await db
          .select()
          .from(likes)
          .where(and(eq(likes.postId, post.id), eq(likes.userId, userId)));

        const [userSave] = await db
          .select()
          .from(saves)
          .where(and(eq(saves.postId, post.id), eq(saves.userId, userId)));

        return {
          ...post,
          user,
          location: location || null,
          likesCount: likesCountResult.count,
          commentsCount: commentsCountResult.count,
          isLiked: !!userLike,
          isSaved: !!userSave,
        };
      })
    );

    return postsWithDetails;
  }

  async getPostWithDetails(postId: string, currentUserId?: string): Promise<PostWithDetails | undefined> {
    const [result] = await db
      .select({
        post: posts,
        user: users,
        location: locations,
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .leftJoin(locations, eq(posts.locationId, locations.id))
      .where(eq(posts.id, postId));

    if (!result || !result.user) return undefined;

    const [likesCountResult] = await db
      .select({ count: count() })
      .from(likes)
      .where(eq(likes.postId, postId));

    const [commentsCountResult] = await db
      .select({ count: count() })
      .from(comments)
      .where(eq(comments.postId, postId));

    let isLiked = false;
    if (currentUserId) {
      const [userLike] = await db
        .select()
        .from(likes)
        .where(and(eq(likes.postId, postId), eq(likes.userId, currentUserId)));
      isLiked = !!userLike;
    }

    return {
      ...result.post,
      user: result.user,
      location: result.location || null,
      likesCount: likesCountResult.count,
      commentsCount: commentsCountResult.count,
      isLiked,
    };
  }

  async deletePost(postId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async deletePostAdmin(postId: string): Promise<boolean> {
    const result = await db
      .delete(posts)
      .where(eq(posts.id, postId))
      .returning();
    return result.length > 0;
  }

  // Video operations
  async createVideo(videoData: InsertVideo): Promise<Video> {
    const [video] = await db.insert(videos).values(videoData).returning();
    return video;
  }

  async getVideo(id: string): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video;
  }

  async getUserVideos(userId: string): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .where(eq(videos.userId, userId))
      .orderBy(desc(videos.createdAt));
  }

  async getFeedVideos(userId: string, limit: number = 20): Promise<VideoWithDetails[]> {
    const feedVideos = await db
      .select({
        video: videos,
        user: users,
        location: locations,
      })
      .from(videos)
      .leftJoin(users, eq(videos.userId, users.id))
      .leftJoin(locations, eq(videos.locationId, locations.id))
      .orderBy(desc(videos.createdAt))
      .limit(limit);

    const videosWithDetails = await Promise.all(
      feedVideos.map(async ({ video, user, location }) => {
        if (!user) throw new Error("Video has no user");

        const [likesCountResult] = await db
          .select({ count: count() })
          .from(likes)
          .where(eq(likes.videoId, video.id));

        const [commentsCountResult] = await db
          .select({ count: count() })
          .from(comments)
          .where(eq(comments.videoId, video.id));

        const [userLike] = await db
          .select()
          .from(likes)
          .where(and(eq(likes.videoId, video.id), eq(likes.userId, userId)));

        const [userSave] = await db
          .select()
          .from(saves)
          .where(and(eq(saves.videoId, video.id), eq(saves.userId, userId)));

        return {
          ...video,
          user,
          location: location || null,
          likesCount: likesCountResult.count,
          commentsCount: commentsCountResult.count,
          isLiked: !!userLike,
          isSaved: !!userSave,
        };
      })
    );

    return videosWithDetails;
  }

  async getVideoWithDetails(videoId: string, currentUserId?: string): Promise<VideoWithDetails | undefined> {
    const [result] = await db
      .select({
        video: videos,
        user: users,
        location: locations,
      })
      .from(videos)
      .leftJoin(users, eq(videos.userId, users.id))
      .leftJoin(locations, eq(videos.locationId, locations.id))
      .where(eq(videos.id, videoId));

    if (!result || !result.user) return undefined;

    const [likesCountResult] = await db
      .select({ count: count() })
      .from(likes)
      .where(eq(likes.videoId, videoId));

    const [commentsCountResult] = await db
      .select({ count: count() })
      .from(comments)
      .where(eq(comments.videoId, videoId));

    let isLiked = false;
    if (currentUserId) {
      const [userLike] = await db
        .select()
        .from(likes)
        .where(and(eq(likes.videoId, videoId), eq(likes.userId, currentUserId)));
      isLiked = !!userLike;
    }

    return {
      ...result.video,
      user: result.user,
      location: result.location || null,
      likesCount: likesCountResult.count,
      commentsCount: commentsCountResult.count,
      isLiked,
    };
  }

  async deleteVideo(videoId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async deleteVideoAdmin(videoId: string): Promise<boolean> {
    const result = await db
      .delete(videos)
      .where(eq(videos.id, videoId))
      .returning();
    return result.length > 0;
  }

  // Location operations
  async createLocation(locationData: InsertLocation): Promise<Location> {
    const [location] = await db.insert(locations).values(locationData).returning();
    return location;
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location;
  }

  async getAllLocations(): Promise<LocationWithDetails[]> {
    const allLocations = await db
      .select({
        location: locations,
        user: users,
      })
      .from(locations)
      .leftJoin(users, eq(locations.userId, users.id))
      .orderBy(desc(locations.createdAt));

    const locationsWithDetails = await Promise.all(
      allLocations.map(async ({ location, user }) => {
        if (!user) throw new Error("Location has no user");

        const [postsCountResult] = await db
          .select({ count: count() })
          .from(posts)
          .where(eq(posts.locationId, location.id));

        return {
          ...location,
          user,
          postsCount: postsCountResult.count,
        };
      })
    );

    return locationsWithDetails;
  }

  async getUserLocations(userId: string): Promise<Location[]> {
    return await db
      .select()
      .from(locations)
      .where(eq(locations.userId, userId))
      .orderBy(desc(locations.createdAt));
  }

  async deleteLocation(locationId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(locations)
      .where(and(eq(locations.id, locationId), eq(locations.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async deleteLocationAdmin(locationId: string): Promise<boolean> {
    const result = await db
      .delete(locations)
      .where(eq(locations.id, locationId))
      .returning();
    return result.length > 0;
  }

  // Like operations
  async likePost(userId: string, postId: string): Promise<Like> {
    // Check if like already exists
    const existingLike = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.postId, postId)))
      .limit(1);
    
    if (existingLike.length > 0) {
      return existingLike[0];
    }
    
    const [like] = await db.insert(likes).values({ userId, postId }).returning();
    return like;
  }

  async unlikePost(userId: string, postId: string): Promise<boolean> {
    const result = await db
      .delete(likes)
      .where(and(eq(likes.userId, userId), eq(likes.postId, postId)))
      .returning();
    return result.length > 0;
  }

  async likeVideo(userId: string, videoId: string): Promise<Like> {
    // Check if like already exists
    const existingLike = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.videoId, videoId)))
      .limit(1);
    
    if (existingLike.length > 0) {
      return existingLike[0];
    }
    
    const [like] = await db.insert(likes).values({ userId, videoId }).returning();
    return like;
  }

  async unlikeVideo(userId: string, videoId: string): Promise<boolean> {
    const result = await db
      .delete(likes)
      .where(and(eq(likes.userId, userId), eq(likes.videoId, videoId)))
      .returning();
    return result.length > 0;
  }

  async isLikedPost(userId: string, postId: string): Promise<boolean> {
    const [like] = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.postId, postId)));
    return !!like;
  }

  async isLikedVideo(userId: string, videoId: string): Promise<boolean> {
    const [like] = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.videoId, videoId)));
    return !!like;
  }

  // Comment operations
  async createComment(commentData: InsertComment): Promise<Comment> {
    const [comment] = await db.insert(comments).values(commentData).returning();
    return comment;
  }

  async getPostComments(postId: string): Promise<CommentWithUser[]> {
    const postComments = await db
      .select({
        comment: comments,
        user: users,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.postId, postId))
      .orderBy(desc(comments.createdAt));

    return postComments.map(({ comment, user }) => {
      if (!user) throw new Error("Comment has no user");
      return { ...comment, user };
    });
  }

  async getVideoComments(videoId: string): Promise<CommentWithUser[]> {
    const videoComments = await db
      .select({
        comment: comments,
        user: users,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.videoId, videoId))
      .orderBy(desc(comments.createdAt));

    return videoComments.map(({ comment, user }) => {
      if (!user) throw new Error("Comment has no user");
      return { ...comment, user };
    });
  }

  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(comments)
      .where(and(eq(comments.id, commentId), eq(comments.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async deleteCommentAdmin(commentId: string): Promise<boolean> {
    const result = await db
      .delete(comments)
      .where(eq(comments.id, commentId))
      .returning();
    return result.length > 0;
  }

  // Admin operations - get ALL content for moderation
  async getAllPosts(): Promise<PostWithDetails[]> {
    const allPosts = await db
      .select({
        post: posts,
        user: users,
        location: locations,
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .leftJoin(locations, eq(posts.locationId, locations.id))
      .orderBy(desc(posts.createdAt));

    const postsWithDetails = await Promise.all(
      allPosts.map(async ({ post, user, location }) => {
        if (!user) throw new Error("Post has no user");

        const [likesCountResult] = await db
          .select({ count: count() })
          .from(likes)
          .where(eq(likes.postId, post.id));

        const [commentsCountResult] = await db
          .select({ count: count() })
          .from(comments)
          .where(eq(comments.postId, post.id));

        return {
          ...post,
          user,
          location: location || null,
          likesCount: likesCountResult.count,
          commentsCount: commentsCountResult.count,
          isLiked: false, // Admin view doesn't need user-specific like status
        };
      })
    );

    return postsWithDetails;
  }

  async getAllVideos(): Promise<VideoWithDetails[]> {
    const allVideos = await db
      .select({
        video: videos,
        user: users,
        location: locations,
      })
      .from(videos)
      .leftJoin(users, eq(videos.userId, users.id))
      .leftJoin(locations, eq(videos.locationId, locations.id))
      .orderBy(desc(videos.createdAt));

    const videosWithDetails = await Promise.all(
      allVideos.map(async ({ video, user, location }) => {
        if (!user) throw new Error("Video has no user");

        const [likesCountResult] = await db
          .select({ count: count() })
          .from(likes)
          .where(eq(likes.videoId, video.id));

        const [commentsCountResult] = await db
          .select({ count: count() })
          .from(comments)
          .where(eq(comments.videoId, video.id));

        return {
          ...video,
          user,
          location: location || null,
          likesCount: likesCountResult.count,
          commentsCount: commentsCountResult.count,
          isLiked: false, // Admin view doesn't need user-specific like status
        };
      })
    );

    return videosWithDetails;
  }

  async getAllComments(): Promise<CommentWithUser[]> {
    const allComments = await db
      .select({
        comment: comments,
        user: users,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .orderBy(desc(comments.createdAt));

    return allComments.map(({ comment, user }) => {
      if (!user) throw new Error("Comment has no user");
      return { ...comment, user };
    });
  }

  // Follow operations
  async followUser(followerId: string, followingId: string): Promise<Follow> {
    const [follow] = await db
      .insert(follows)
      .values({ followerId, followingId })
      .returning();
    return follow;
  }

  async unfollowUser(followerId: string, followingId: string): Promise<boolean> {
    const result = await db
      .delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .returning();
    return result.length > 0;
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const [follow] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    return !!follow;
  }

  // Save operations
  async savePost(userId: string, postId: string): Promise<Save> {
    const [existingSave] = await db
      .select()
      .from(saves)
      .where(and(eq(saves.userId, userId), eq(saves.postId, postId)));
    
    if (existingSave) {
      return existingSave;
    }
    
    const [save] = await db
      .insert(saves)
      .values({ userId, postId })
      .returning();
    return save;
  }

  async unsavePost(userId: string, postId: string): Promise<boolean> {
    const result = await db
      .delete(saves)
      .where(and(eq(saves.userId, userId), eq(saves.postId, postId)))
      .returning();
    return result.length > 0;
  }

  async saveVideo(userId: string, videoId: string): Promise<Save> {
    const [existingSave] = await db
      .select()
      .from(saves)
      .where(and(eq(saves.userId, userId), eq(saves.videoId, videoId)));
    
    if (existingSave) {
      return existingSave;
    }
    
    const [save] = await db
      .insert(saves)
      .values({ userId, videoId })
      .returning();
    return save;
  }

  async unsaveVideo(userId: string, videoId: string): Promise<boolean> {
    const result = await db
      .delete(saves)
      .where(and(eq(saves.userId, userId), eq(saves.videoId, videoId)))
      .returning();
    return result.length > 0;
  }

  async getSavedPosts(userId: string): Promise<PostWithDetails[]> {
    const savedPosts = await db
      .select({
        post: posts,
        user: users,
        location: locations,
      })
      .from(saves)
      .innerJoin(posts, eq(saves.postId, posts.id))
      .leftJoin(users, eq(posts.userId, users.id))
      .leftJoin(locations, eq(posts.locationId, locations.id))
      .where(and(eq(saves.userId, userId), sql`${saves.postId} IS NOT NULL`))
      .orderBy(desc(saves.createdAt));

    return Promise.all(
      savedPosts.map(async ({ post, user, location }) => {
        const [likesCountResult] = await db
          .select({ count: count() })
          .from(likes)
          .where(eq(likes.postId, post.id));

        const [commentsCountResult] = await db
          .select({ count: count() })
          .from(comments)
          .where(eq(comments.postId, post.id));

        const isLiked = await this.isLikedPost(userId, post.id);

        return {
          ...post,
          user: user!,
          location: location || undefined,
          likesCount: likesCountResult.count,
          commentsCount: commentsCountResult.count,
          isLiked,
        };
      })
    );
  }

  async getSavedVideos(userId: string): Promise<VideoWithDetails[]> {
    const savedVideos = await db
      .select({
        video: videos,
        user: users,
        location: locations,
      })
      .from(saves)
      .innerJoin(videos, eq(saves.videoId, videos.id))
      .leftJoin(users, eq(videos.userId, users.id))
      .leftJoin(locations, eq(videos.locationId, locations.id))
      .where(and(eq(saves.userId, userId), sql`${saves.videoId} IS NOT NULL`))
      .orderBy(desc(saves.createdAt));

    return Promise.all(
      savedVideos.map(async ({ video, user, location }) => {
        const [likesCountResult] = await db
          .select({ count: count() })
          .from(likes)
          .where(eq(likes.videoId, video.id));

        const [commentsCountResult] = await db
          .select({ count: count() })
          .from(comments)
          .where(eq(comments.videoId, video.id));

        const isLiked = await this.isLikedVideo(userId, video.id);

        return {
          ...video,
          user: user!,
          location: location || undefined,
          likesCount: likesCountResult.count,
          commentsCount: commentsCountResult.count,
          isLiked,
        };
      })
    );
  }

  async isSavedPost(userId: string, postId: string): Promise<boolean> {
    const [save] = await db
      .select()
      .from(saves)
      .where(and(eq(saves.userId, userId), eq(saves.postId, postId)));
    return !!save;
  }

  async isSavedVideo(userId: string, videoId: string): Promise<boolean> {
    const [save] = await db
      .select()
      .from(saves)
      .where(and(eq(saves.userId, userId), eq(saves.videoId, videoId)));
    return !!save;
  }
}

export const storage = new DatabaseStorage();
