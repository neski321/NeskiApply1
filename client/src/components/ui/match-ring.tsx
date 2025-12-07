import { cn } from "@/lib/utils";

export function MatchRing({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const sizeClasses = {
    sm: "h-10 w-10 text-xs",
    md: "h-16 w-16 text-sm",
    lg: "h-24 w-24 text-lg",
  };

  const colorClass = score >= 90 
    ? "text-primary stroke-primary" 
    : score >= 75 
      ? "text-emerald-500 stroke-emerald-500" 
      : "text-amber-500 stroke-amber-500";

  return (
    <div className={cn("relative flex items-center justify-center font-mono font-bold", sizeClasses[size])}>
      <svg className="transform -rotate-90 w-full h-full" viewBox="0 0 40 40">
        <circle
          className="text-muted/20"
          strokeWidth="3"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="20"
          cy="20"
        />
        <circle
          className={cn("transition-all duration-1000 ease-out", colorClass)}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="20"
          cy="20"
        />
      </svg>
      <span className={cn("absolute", colorClass.split(" ")[0])}>{score}%</span>
    </div>
  );
}
