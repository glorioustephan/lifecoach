// Shim so prompt-kit / shadcn components that import `@/lib/utils` resolve to
// our existing `cn` implementation without duplicating it.
export { cn } from "./cn";
