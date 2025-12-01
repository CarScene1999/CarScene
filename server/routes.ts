import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { isAdmin } from "./utils/adminCheck";
import { 
  insertPostSchema, 
  insertVideoSchema, 
  insertLocationSchema,
  insertCommentSchema 
} from "@shared/schema";
import { z } from "zod";

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(50),
  lastName: z.string().trim().min(1, "Last name is required").max(50),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
  profileImageUrl: z.string().trim().url().optional().or(z.literal("")),
});
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const userEmail = req.user.claims.email;
      const admin = isAdmin(userEmail);
      res.json({ ...user, isAdmin: admin });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.put('/api/users/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Validate request body with Zod schema
      const validationResult = updateProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid profile data", 
          errors: validationResult.error.errors 
        });
      }

      const { firstName, lastName, bio, profileImageUrl } = validationResult.data;

      // Build update data - firstName and lastName are always included
      const updateData: any = { firstName, lastName };
      
      // Handle bio: include if provided (even if empty string to clear it)
      if (bio !== undefined) {
        updateData.bio = bio || null;
      }
      
      // Handle profileImageUrl: include if provided (empty string clears it)
      if (profileImageUrl !== undefined) {
        updateData.profileImageUrl = profileImageUrl || null;
      }
      
      const updatedUser = await storage.updateUserProfile(userId, updateData);

      // Return only safe user fields
      const safeResponse = {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        bio: updatedUser.bio,
        profileImageUrl: updatedUser.profileImageUrl,
      };

      res.json(safeResponse);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Object Storage routes for file uploads
  app.post('/api/objects/upload', isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const isPublic = req.body?.public === true;
      const uploadURL = isPublic 
        ? await objectStorageService.getPublicObjectUploadURL()
        : await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.get('/objects/:objectPath(*)', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      
      if (!canAccess) {
        return res.sendStatus(401);
      }
      
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Serve public objects without authentication - no ACL check needed
  app.get('/public-objects/:objectPath(*)', async (req: any, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      
      // Public objects are accessible by anyone - use downloadPublicObject (no ACL check)
      objectStorageService.downloadPublicObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing public object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.put('/api/location-images', isAuthenticated, async (req: any, res) => {
    try {
      if (!req.body.imageURL) {
        return res.status(400).json({ error: "imageURL is required" });
      }

      const userId = req.user?.claims?.sub;
      const objectStorageService = new ObjectStorageService();
      
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.imageURL,
        {
          owner: userId,
          visibility: "public", // Location images are public so everyone can see them
        },
      );

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting location image ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Set ACL policy for post/video images to make them publicly accessible
  app.put('/api/media-images', isAuthenticated, async (req: any, res) => {
    try {
      if (!req.body.imageURL) {
        return res.status(400).json({ error: "imageURL is required" });
      }

      const userId = req.user?.claims?.sub;
      const objectStorageService = new ObjectStorageService();
      
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.imageURL,
        {
          owner: userId,
          visibility: "public", // Post/video images are public so everyone can see them
        },
      );

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting media image ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // OpenRouteService proxy to avoid CORS issues
  app.post('/api/route', async (req, res) => {
    try {
      const { start, end } = req.body;
      const apiKey = process.env.VITE_OPENROUTESERVICE_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ message: "OpenRouteService API key not configured" });
      }

      const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
          'Authorization': apiKey,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          coordinates: [start, end] // Frontend already sends [lng, lat], no need to swap
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouteService error:', errorText);
        return res.status(response.status).json({ message: 'Failed to fetch route from OpenRouteService' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error proxying route request:', error);
      res.status(500).json({ message: 'Failed to fetch route' });
    }
  });

  // Admin-only routes - fetch ALL content for moderation
  app.get('/api/admin/posts', isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      if (!isAdmin(userEmail)) {
        return res.status(403).json({ message: "Forbidden - Admin access required" });
      }

      const posts = await storage.getAllPosts();
      res.json(posts);
    } catch (error) {
      console.error("Error fetching all posts:", error);
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  app.get('/api/admin/videos', isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      if (!isAdmin(userEmail)) {
        return res.status(403).json({ message: "Forbidden - Admin access required" });
      }

      const videos = await storage.getAllVideos();
      res.json(videos);
    } catch (error) {
      console.error("Error fetching all videos:", error);
      res.status(500).json({ message: "Failed to fetch videos" });
    }
  });

  app.get('/api/admin/locations', isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      if (!isAdmin(userEmail)) {
        return res.status(403).json({ message: "Forbidden - Admin access required" });
      }

      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching all locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.get('/api/admin/comments', isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      if (!isAdmin(userEmail)) {
        return res.status(403).json({ message: "Forbidden - Admin access required" });
      }

      const comments = await storage.getAllComments();
      res.json(comments);
    } catch (error) {
      console.error("Error fetching all comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  // User routes
  app.get('/api/users/profile/:userId?', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const userId = req.params.userId || currentUserId;
      const profile = await storage.getUserProfile(userId, currentUserId);
      
      if (!profile) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  app.patch('/api/users/bio', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { bio } = req.body;
      const user = await storage.updateUserBio(userId, bio);
      res.json(user);
    } catch (error) {
      console.error("Error updating bio:", error);
      res.status(500).json({ message: "Failed to update bio" });
    }
  });

  // Post routes
  app.post('/api/posts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const postData = insertPostSchema.parse({ ...req.body, userId });
      const post = await storage.createPost(postData);
      res.json(post);
    } catch (error: any) {
      console.error("Error creating post:", error);
      res.status(400).json({ message: error.message || "Failed to create post" });
    }
  });

  app.get('/api/posts/feed', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const posts = await storage.getFeedPosts(userId, 20);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching feed:", error);
      res.status(500).json({ message: "Failed to fetch feed" });
    }
  });

  app.get('/api/posts/user/:userId?', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.params.userId || req.user.claims.sub;
      const posts = await storage.getUserPosts(userId);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching user posts:", error);
      res.status(500).json({ message: "Failed to fetch user posts" });
    }
  });

  app.get('/api/posts/:postId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const post = await storage.getPostWithDetails(req.params.postId, currentUserId);
      
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      res.json(post);
    } catch (error) {
      console.error("Error fetching post:", error);
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  app.delete('/api/posts/:postId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const admin = isAdmin(userEmail);
      
      let deleted;
      if (admin) {
        // Admins can delete any post - pass null to skip ownership check
        deleted = await storage.deletePostAdmin(req.params.postId);
      } else {
        deleted = await storage.deletePost(req.params.postId, userId);
      }
      
      if (!deleted) {
        return res.status(404).json({ message: "Post not found or unauthorized" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  // Video routes
  app.post('/api/videos', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const videoData = insertVideoSchema.parse({ ...req.body, userId });
      const video = await storage.createVideo(videoData);
      res.json(video);
    } catch (error: any) {
      console.error("Error creating video:", error);
      res.status(400).json({ message: error.message || "Failed to create video" });
    }
  });

  app.get('/api/videos/feed', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const videos = await storage.getFeedVideos(userId, 20);
      res.json(videos);
    } catch (error) {
      console.error("Error fetching video feed:", error);
      res.status(500).json({ message: "Failed to fetch video feed" });
    }
  });

  app.get('/api/videos/user/:userId?', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.params.userId || req.user.claims.sub;
      const videos = await storage.getUserVideos(userId);
      res.json(videos);
    } catch (error) {
      console.error("Error fetching user videos:", error);
      res.status(500).json({ message: "Failed to fetch user videos" });
    }
  });

  app.get('/api/videos/:videoId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const video = await storage.getVideoWithDetails(req.params.videoId, currentUserId);
      
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      res.json(video);
    } catch (error) {
      console.error("Error fetching video:", error);
      res.status(500).json({ message: "Failed to fetch video" });
    }
  });

  app.delete('/api/videos/:videoId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const admin = isAdmin(userEmail);
      
      let deleted;
      if (admin) {
        deleted = await storage.deleteVideoAdmin(req.params.videoId);
      } else {
        deleted = await storage.deleteVideo(req.params.videoId, userId);
      }
      
      if (!deleted) {
        return res.status(404).json({ message: "Video not found or unauthorized" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting video:", error);
      res.status(500).json({ message: "Failed to delete video" });
    }
  });

  // Location routes
  app.post('/api/locations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const locationData = insertLocationSchema.parse({ ...req.body, userId });
      const location = await storage.createLocation(locationData);
      res.json(location);
    } catch (error: any) {
      console.error("Error creating location:", error);
      res.status(400).json({ message: error.message || "Failed to create location" });
    }
  });

  app.get('/api/locations', isAuthenticated, async (req: any, res) => {
    try {
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.get('/api/locations/user/:userId?', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.params.userId || req.user.claims.sub;
      const locations = await storage.getUserLocations(userId);
      res.json(locations);
    } catch (error) {
      console.error("Error fetching user locations:", error);
      res.status(500).json({ message: "Failed to fetch user locations" });
    }
  });

  app.get('/api/locations/:locationId', isAuthenticated, async (req: any, res) => {
    try {
      const location = await storage.getLocation(req.params.locationId);
      
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      res.json(location);
    } catch (error) {
      console.error("Error fetching location:", error);
      res.status(500).json({ message: "Failed to fetch location" });
    }
  });

  app.delete('/api/locations/:locationId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const admin = isAdmin(userEmail);
      
      let deleted;
      if (admin) {
        deleted = await storage.deleteLocationAdmin(req.params.locationId);
      } else {
        deleted = await storage.deleteLocation(req.params.locationId, userId);
      }
      
      if (!deleted) {
        return res.status(404).json({ message: "Location not found or unauthorized" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(500).json({ message: "Failed to delete location" });
    }
  });

  // Like routes
  app.post('/api/likes/post/:postId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const like = await storage.likePost(userId, req.params.postId);
      res.json(like);
    } catch (error) {
      console.error("Error liking post:", error);
      res.status(500).json({ message: "Failed to like post" });
    }
  });

  app.delete('/api/likes/post/:postId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.unlikePost(userId, req.params.postId);
      // Return success even if like didn't exist (idempotent delete)
      res.json({ success: true });
    } catch (error) {
      console.error("Error unliking post:", error);
      res.status(500).json({ message: "Failed to unlike post" });
    }
  });

  app.post('/api/likes/video/:videoId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const like = await storage.likeVideo(userId, req.params.videoId);
      res.json(like);
    } catch (error) {
      console.error("Error liking video:", error);
      res.status(500).json({ message: "Failed to like video" });
    }
  });

  app.delete('/api/likes/video/:videoId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.unlikeVideo(userId, req.params.videoId);
      // Return success even if like didn't exist (idempotent delete)
      res.json({ success: true });
    } catch (error) {
      console.error("Error unliking video:", error);
      res.status(500).json({ message: "Failed to unlike video" });
    }
  });

  // Save routes
  app.post('/api/saves/post/:postId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const save = await storage.savePost(userId, req.params.postId);
      res.json(save);
    } catch (error) {
      console.error("Error saving post:", error);
      res.status(500).json({ message: "Failed to save post" });
    }
  });

  app.delete('/api/saves/post/:postId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.unsavePost(userId, req.params.postId);
      // Return success even if save didn't exist (idempotent delete)
      res.json({ success: true });
    } catch (error) {
      console.error("Error unsaving post:", error);
      res.status(500).json({ message: "Failed to unsave post" });
    }
  });

  app.post('/api/saves/video/:videoId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const save = await storage.saveVideo(userId, req.params.videoId);
      res.json(save);
    } catch (error) {
      console.error("Error saving video:", error);
      res.status(500).json({ message: "Failed to save video" });
    }
  });

  app.delete('/api/saves/video/:videoId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.unsaveVideo(userId, req.params.videoId);
      // Return success even if save didn't exist (idempotent delete)
      res.json({ success: true });
    } catch (error) {
      console.error("Error unsaving video:", error);
      res.status(500).json({ message: "Failed to unsave video" });
    }
  });

  app.get('/api/saves/posts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const savedPosts = await storage.getSavedPosts(userId);
      res.json(savedPosts);
    } catch (error) {
      console.error("Error fetching saved posts:", error);
      res.status(500).json({ message: "Failed to fetch saved posts" });
    }
  });

  app.get('/api/saves/videos', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const savedVideos = await storage.getSavedVideos(userId);
      res.json(savedVideos);
    } catch (error) {
      console.error("Error fetching saved videos:", error);
      res.status(500).json({ message: "Failed to fetch saved videos" });
    }
  });

  // Comment routes
  app.post('/api/comments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const commentData = insertCommentSchema.parse({ ...req.body, userId });
      const comment = await storage.createComment(commentData);
      res.json(comment);
    } catch (error: any) {
      console.error("Error creating comment:", error);
      res.status(400).json({ message: error.message || "Failed to create comment" });
    }
  });

  app.get('/api/comments/post/:postId', isAuthenticated, async (req: any, res) => {
    try {
      const comments = await storage.getPostComments(req.params.postId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching post comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.get('/api/comments/video/:videoId', isAuthenticated, async (req: any, res) => {
    try {
      const comments = await storage.getVideoComments(req.params.videoId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching video comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.delete('/api/comments/:commentId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const admin = isAdmin(userEmail);
      
      let deleted;
      if (admin) {
        deleted = await storage.deleteCommentAdmin(req.params.commentId);
      } else {
        deleted = await storage.deleteComment(req.params.commentId, userId);
      }
      
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found or unauthorized" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Follow routes
  app.post('/api/follows/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user.claims.sub;
      const followingId = req.params.userId;
      
      if (followerId === followingId) {
        return res.status(400).json({ message: "Cannot follow yourself" });
      }
      
      const follow = await storage.followUser(followerId, followingId);
      res.json(follow);
    } catch (error) {
      console.error("Error following user:", error);
      res.status(500).json({ message: "Failed to follow user" });
    }
  });

  app.delete('/api/follows/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user.claims.sub;
      const followingId = req.params.userId;
      const unfollowed = await storage.unfollowUser(followerId, followingId);
      
      if (!unfollowed) {
        return res.status(404).json({ message: "Follow relationship not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error unfollowing user:", error);
      res.status(500).json({ message: "Failed to unfollow user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
