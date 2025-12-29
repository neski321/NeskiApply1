import type { User } from "@shared/schema";

// Extend Express Request to include user from Passport
declare global {
  namespace Express {
    interface User extends User {}
  }
}





