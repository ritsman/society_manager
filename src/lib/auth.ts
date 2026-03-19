import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user || !user.passwordHash) {
          throw new Error("No user found with this email");
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!isPasswordValid) {
          throw new Error("Invalid password");
        }

        // Return the user object (this gets passed to the JWT callback)
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      }
    })
  ],
  callbacks: {
    // 1. Take the user data from above and put it into the JWT token
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role; // e.g., "SUPERADMIN"
      }
      return token;
    },
    // 2. Take the token data and expose it to the client session
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login", // Tells NextAuth where your custom login page is
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};