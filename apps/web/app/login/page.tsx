import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

async function signIn(formData: FormData) {
  "use server";
  const password = formData.get("password");
  if (
    typeof password !== "string" ||
    password !== process.env.DASHBOARD_PASSWORD
  ) {
    redirect("/login?error=1");
  }
  const token = await createSessionToken(process.env.SESSION_SECRET!);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Kata</CardTitle>
          <CardDescription>
            The notebook that never forgets. Sign in to open the memory
            dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signIn} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <Label htmlFor="password">Access password</Label>
              <p className="text-sm text-muted-foreground">
                Judges: use the password from the submission's testing
                instructions.
              </p>
              <Input id="password" name="password" type="password" required />
            </fieldset>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                That password is not right. Check the testing instructions and
                try again.
              </p>
            ) : null}
            <Button type="submit">Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
