import { Button } from "@/components/ui/button";
import { ArrowLeft, Construction } from "lucide-react";
import { useLocation } from "wouter";

export default function WorkspacePlaceholder({ title, description }: { title: string; description: string }) {
  const [, setLocation] = useLocation();
  return (
    <section className="mx-auto flex min-h-[68vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Construction className="h-6 w-6" /></span>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-primary">In progress</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.045em] text-slate-950">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      <Button variant="outline" onClick={() => setLocation("/")} className="mt-7 rounded-xl bg-white"><ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard</Button>
    </section>
  );
}
