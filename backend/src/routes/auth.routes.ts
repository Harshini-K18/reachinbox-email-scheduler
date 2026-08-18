import { Router } from "express";
import {
  currentUser,
  googleLogin,
  passwordLogin,
  register,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

// Google OAuth / Google Identity Services credential.
router.post("/google", googleLogin);

// Email/password authentication.
router.post("/login", passwordLogin);
router.post("/register", register);

// Current authenticated user.
router.get("/me", requireAuth, currentUser);

export default router;
