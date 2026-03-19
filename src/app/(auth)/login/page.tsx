// src/app/(auth)/login/page.tsx
"use client";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const router = useRouter()

  const handleSubmit2 = async (e: React.FormEvent) => {
    e.preventDefault();
    // We will wire this up to NextAuth in the next step
    console.log("Attempting login with:", { email, password });
  };
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  // Call NextAuth
  const result = await signIn("credentials", {
    email: email,       // Replace with your actual state variable
    password: password, // Replace with your actual state variable
    redirect: false,
  });

  if (result?.error) {
    setError(result.error);
  } else {
    // Success! Push them to the dashboard
    router.push("/dashboard");
    router.refresh(); // Forces a refresh so the layout picks up the new session
  }
};
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-md border border-gray-100">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Society Manager
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to access your dashboard
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                type="email"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}