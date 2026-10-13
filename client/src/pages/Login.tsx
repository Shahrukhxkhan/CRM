import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowRight, CheckCircle2, KeyRound, Lock, Mail, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("admin@soloflow.local");
  const [password, setPassword] = useState("admin123");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const utils = trpc.useUtils();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed. Please check credentials.");
      }

      // Store preview auto-login token in sessionStorage for compatibility
      if (data.token) {
        try {
          sessionStorage.setItem("manus-cookie", data.token);
        } catch {}
      }

      toast.success("Successfully logged in!");
      await utils.auth.me.invalidate();
      setLocation("/contacts");
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred during login.");
      toast.error(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = () => {
    setUsername("admin@soloflow.local");
    setPassword("admin123");
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#090d16] text-slate-100 p-4 relative overflow-hidden">
      {/* Background radial effects */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_20%,rgba(59,130,246,0.18),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(14,165,233,0.12),transparent_40%)]" />

      {/* Login Card */}
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 backdrop-blur-xl rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-500/25">
              SF
            </span>
            <span className="text-xl font-bold tracking-tight text-white">
              SoloFlow<span className="text-blue-400">CRM</span>
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Sign In to Workspace</h1>
          <p className="text-sm text-slate-400 mt-1">
            Access your contacts, pipelines, deals, and reports
          </p>
        </div>

        {/* Demo Credentials Helper Box */}
        <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-950/40 p-4 text-xs">
          <div className="flex items-center justify-between font-semibold text-blue-300 mb-2">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              Default Local Credentials
            </span>
            <button
              type="button"
              onClick={handleQuickFill}
              className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              Fill form
            </button>
          </div>
          <div className="space-y-1 text-slate-300 font-mono">
            <p>
              Username: <span className="text-white font-medium">admin@soloflow.local</span>
            </p>
            <p>
              Password: <span className="text-white font-medium">admin123</span>
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs font-medium text-slate-300">
              Username or Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin@soloflow.local"
                required
                className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-slate-300">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 h-11 rounded-lg bg-blue-600 text-white hover:bg-blue-500 font-medium shadow-lg shadow-blue-600/30 transition-all"
          >
            {isLoading ? "Signing in..." : "Sign In"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-800/80 pt-4 text-center">
          <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
            Owner-Scoped Local Development Environment
          </p>
        </div>
      </div>
    </div>
  );
}
